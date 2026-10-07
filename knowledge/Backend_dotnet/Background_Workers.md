# Background Workers — фоновые сервисы

> **Назначение документа:** логика фоновых сервисов DeskHub на базе `BackgroundService`: опрос внешних API и хоста, запись в БД, рассылка через SignalR.
> Связанные документы: [`Core_Architecture.md`](Core_Architecture.md) (DI, `DashboardNotifier`), [`Database_EFCore.md`](Database_EFCore.md) (модели), клиентская сторона — [`../Frontend_react/Feature_Widgets.md`](../Frontend_react/Feature_Widgets.md).

---

## 1. Обзор

| Воркер | Источник | Интервал | Пишет в БД | SignalR-событие |
|---|---|---|---|---|
| `WeatherWorker` | Open-Meteo (HTTPS) | 15 мин | `weather_logs` | `WeatherUpdated` |
| `TrafficWorker` | API карт (HTTPS) | 5 мин, в часы пик 2 мин | `traffic_logs` | `TrafficUpdated` |
| `TelemetryWorker` | `/proc`, `/sys` хоста | 1 с | — (только память) | `TelemetryTick` |
| `RetentionWorker` | PostgreSQL | раз в сутки (≈ 03:30) | удаление старых логов | — |

Общий поток каждого воркера:

```
 ┌─────────── итерация ───────────┐
 │ 1. Получить данные (HTTP/файлы)│
 │ 2. Смаппить в доменную модель  │
 │ 3. Сохранить в БД (если нужно) │──► PostgreSQL
 │ 4. Смаппить в DTO              │
 │ 5. Notifier.Send…Update()      │──► DashboardState + SignalR Clients.All
 └────────────┬───────────────────┘
              ▼
     ждать следующий тик (PeriodicTimer)
```

---

## 2. Базовый шаблон воркера

### 2.1. Правила

1. **`PeriodicTimer`**, а не `Task.Delay` в цикле — не накапливает дрейф и корректно отменяется.
2. **Первая итерация — сразу при старте**, не дожидаясь первого тика (экран не должен ждать 15 минут погоду).
3. **Исключение внутри итерации не убивает воркер.** С .NET 8 необработанное исключение в `ExecuteAsync` по умолчанию **останавливает весь хост** (`BackgroundServiceExceptionBehavior.StopHost`). Каждая итерация обёрнута в `try/catch`.
4. **`DbContext` — новый scope на итерацию** через `IServiceScopeFactory`.
5. **Корректная остановка:** `stoppingToken` пробрасывается во все async-вызовы; `OperationCanceledException` при остановке не логируется как ошибка.
6. **`TimeProvider`** вместо `DateTime.UtcNow` — для тестируемости.
7. Воркер не должен блокировать старт приложения: тяжёлая работа начинается после `await Task.Yield()` / первого `await`.

### 2.2. Базовый класс

```csharp
public abstract class PeriodicWorker(ILogger logger, TimeProvider time) : BackgroundService
{
    protected abstract TimeSpan GetInterval();              // может зависеть от времени суток
    protected abstract Task RunOnceAsync(CancellationToken ct);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        await SafeRunAsync(stoppingToken);                   // первая итерация сразу

        while (!stoppingToken.IsCancellationRequested)
        {
            using var timer = new PeriodicTimer(GetInterval(), time);
            try
            {
                await timer.WaitForNextTickAsync(stoppingToken);
            }
            catch (OperationCanceledException) { break; }

            await SafeRunAsync(stoppingToken);
        }
    }

    private async Task SafeRunAsync(CancellationToken ct)
    {
        try { await RunOnceAsync(ct); }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
        catch (Exception ex) { logger.LogError(ex, "{Worker} iteration failed", GetType().Name); }
    }
}
```

> Таймер пересоздаётся каждую итерацию, чтобы интервал мог меняться динамически (часы пик у `TrafficWorker`). Для `TelemetryWorker` с постоянным интервалом используется один таймер на всё время работы.

### 2.3. Устойчивость внешних вызовов

- `AddStandardResilienceHandler()` на typed `HttpClient`: ретраи с экспоненциальной задержкой, circuit breaker, общий таймаут (≈ 30 с).
- При отказе внешнего API воркер **не пушит** пустые данные: на экране остаются последние известные, а фронт сам пометит их устаревшими по `updatedAt`.
- Ошибки логируются как `Warning` (временный сбой сети — норма для устройства на Wi-Fi), повторяющиеся N раз подряд — как `Error`.

---

## 3. WeatherWorker

### 3.1. Алгоритм

```
каждые OpenMeteo:IntervalMinutes (15):
  1. GET Open-Meteo /v1/forecast
  2. Маппинг ответа → WeatherLog (+ HourlyForecast на 24 ч вперёд)
  3. Если current.time не изменился с прошлого раза → пропустить запись в БД
     (Open-Meteo обновляет current раз в 15 мин), иначе INSERT в weather_logs
  4. Маппинг → WeatherDto (updatedAt = время получения)
  5. notifier.SendWeatherUpdate(dto) → DashboardState + WeatherUpdated
```

### 3.2. Запрос к Open-Meteo

> **Текущая реализация:** `Workers/WeatherWorker.cs` + `Services/Weather/` (`OpenMeteoOptions`, `OpenMeteoResponse`, `OpenMeteoMapper`, `WeatherCodes`). Отличия от описания ниже:
> - `timezone=auto` (а не `UTC`): локальные времена ответа переводятся в `DateTimeOffset` по `utc_offset_seconds`, в DTO уходят со смещением (`2026-10-07T21:00:00+03:00`).
> - Поля запроса: `current=temperature_2m,apparent_temperature,weather_code,precipitation,is_day,uv_index`, `hourly=temperature_2m,weather_code,is_day,precipitation_probability`, `forecast_days=2`; `daily` и ветер пока не запрашиваются.
> - Named `HttpClient` `"OpenMeteo"` (таймаут 20 с) без `AddStandardResilienceHandler`; вместо него — повтор в самом воркере: 1 → 2 → 4 … мин, но не дольше интервала опроса. Первая итерация — сразу при старте.
> - В БД (`weather_logs`) пока не пишется — до этапа EF Core; до первого успешного запроса `weather` в snapshot = `null`.
> - WMO-код → описание и **ключ иконки** (`clear-day`, `clear-night`, `partly-cloudy-day/night`, `cloudy`, `fog`, `drizzle`, `rain`, `sleet`, `snow`, `thunderstorm`) считает бэкенд (`WeatherCodes.cs`); фронтенд только сопоставляет ключ с иконкой lucide.

API бесплатный, **без ключа**, лимиты с запасом для одного устройства.

```
GET https://api.open-meteo.com/v1/forecast
    ?latitude=55.75&longitude=37.62
    &current=temperature_2m,apparent_temperature,weather_code,is_day,precipitation,wind_speed_10m,uv_index
    &hourly=temperature_2m,weather_code,precipitation_probability,uv_index
    &daily=sunrise,sunset,temperature_2m_max,temperature_2m_min
    &wind_speed_unit=ms
    &timezone=UTC
    &forecast_days=2
```

| Поле DTO | Источник Open-Meteo |
|---|---|
| `current.temperature` | `current.temperature_2m` |
| `current.apparentTemperature` | `current.apparent_temperature` |
| `current.weatherCode` / `isDay` | `current.weather_code` / `current.is_day` |
| `current.precipitation` | `current.precipitation` |
| `current.precipitationProbability` | `hourly.precipitation_probability` для текущего часа (в `current` этого поля нет) |
| `current.windSpeed` | `current.wind_speed_10m` (м/с благодаря `wind_speed_unit=ms`) |
| `current.uvIndex` | `current.uv_index` |
| `hourly[]` | `hourly.*` — параллельные массивы, «склеиваются» по индексу, фильтр: от текущего часа + 24 ч |
| `daily` | `daily.*[0]` — сегодня |

- `timezone=UTC` — все времена приходят в UTC (локальное время форматирует фронт). Время Open-Meteo без суффикса зоны → парсить как UTC явно.
- Ответ десериализуется в внутренние `OpenMeteoResponse` record-типы (`snake_case` через `JsonPropertyName`) и наружу не протекает.

### 3.3. Прогрев при старте

До первого успешного опроса `DashboardState` заполняется последней записью `weather_logs` (с её исходным `updatedAt` — фронт корректно покажет «устарело», если запись старая).

---

## 4. TrafficWorker

> **Текущая реализация:** `Workers/TrafficWorker.cs` + `Services/Traffic/`. Первая итерация сразу; ошибка итерации логируется (`Warning`) и не роняет хост. Вместо `PeriodicTimer` — `Task.Delay(delay, TimeProvider, ct)` со **случайным отклонением (jitter)**: `Traffic:IntervalMinutes` (5 мин) + `Random.Shared.Next(-60, 121)` с, т.е. 4–7 мин, не меньше 1 мин — запросы с идеально ровным шагом легко опознаются анти-ботом Яндекса. После каждой итерации в лог (`Information`) пишется «Next traffic refresh in N s». Провайдер выбирается `Traffic:Provider`: **`Yandex`** (по умолчанию) или `Mock`.
>
> **`YandexHtmlTrafficProvider` — разбор веб-версии Яндекс Карт** (открытого HTTP API с пробками нет; 1 запрос в 5 мин):
> - GET `https://yandex.ru/maps/?rtext={латДом},{долДом}~{латРабота},{долРабота}&rtt=auto` (координаты — секция `Traffic`: Вешняковская 25/2 = 55.736021, 37.826279; Ак. Королева 10 = 55.822452, 37.606012). Named `HttpClient` `"YandexMaps"`: заголовки обычного Chrome (`User-Agent`, `Accept`, `Accept-Language: ru-RU`), распаковка gzip/br, таймаут 30 с, редиректы разрешены (вне РФ Яндекс отдаёт `yandex.com` с теми же данными).
> - Яндекс рендерит маршруты на сервере: всё состояние страницы — один JSON в `<script class="state-view">` (~1.1 МБ). **Regex только вырезает этот JSON**, разбор — `System.Text.Json` (`YandexRouteParser`). Регулярки по `"time":(\d+)` / `"text":"N мин"` ненадёжны: такие поля есть у сотен сегментов.
> - Путь: `config.routerResponse.routes[]` (если не найден — поиск `routerResponse` по всему дереву). У маршрута: `distance.value` (м), `duration` (с, по пустой дороге), `durationInTraffic` (с, с пробками), `paths[].segments[].street` — названия дорог по ходу.
> - Яндекс предлагает несколько вариантов (07.10.2026 вечером — 6, длиной 23–32 км). **Варианты опознаются по дорогам, а не по длине** (длины близки и зависят от пробок): «Через МКАД» — самый быстрый вариант со `street = "МКАД"`; «Через ТТК» — самый быстрый со `"ТТК"` (или «Третье транспортное кольцо») без МКАД. Если пути через ТТК сейчас нет — самый быстрый из городских с честной подписью «Через центр» (`id` остаётся `ttk` — геометрия схемы).
> - `congestion` = `Classify(durationInTraffic, duration)` — база берётся из ответа Яндекса для этого же маршрута, а не константой.
> - Сбой (сеть, HTTP-ошибка, капча — редирект на `/showcaptcha` или нет `state-view`, смена структуры JSON) → исключение → воркер логирует и **не рассылает** данные. На экране остаются последние полученные, фронтенд через 10 мин пометит их устаревшими. Мок-данные как подмена реальных намеренно не используются: они выглядели бы как настоящие.
> - Риски: это не публичный API — Яндекс может поменять структуру страницы или начать отдавать капчу; автоматический сбор данных противоречит условиям использования Яндекс Карт. Легальные альтернативы — платный Яндекс Router API или TomTom Routing API (бесплатный лимит покрывает 288 запросов/сутки); подключаются новой реализацией `ITrafficProvider`.
>
> **`MockTrafficProvider`** (`Traffic:Provider=Mock`): ТТК ~20 км, 35–70 мин со скачками; МКАД ~28 км, 45–55 мин; «время без пробок» 32 и 42 мин.

### 4.1. Абстракция провайдера

Провайдер маршрутов выбирается конфигурацией (`Traffic:Provider`) и скрыт за интерфейсом — чтобы можно было сменить API без изменения воркера:

```csharp
public interface ITrafficProvider
{
    Task<RouteMeasurement> MeasureAsync(RouteCoordinates route, CancellationToken ct);
}

public sealed record RouteMeasurement(
    int DurationSeconds,          // с учётом текущих пробок
    int? NoTrafficDurationSeconds,// время без пробок, если провайдер умеет
    int DistanceMeters);
```

| Кандидат | Поля ответа | Примечание |
|---|---|---|
| **TomTom Routing API** | `travelTimeInSeconds`, `noTrafficTravelTimeInSeconds`, `lengthInMeters` (`computeTravelTimeFor=all`, `traffic=true`) | Бесплатный тариф покрывает нагрузку одного устройства |
| Google Routes API | `duration`, `staticDuration`, `distanceMeters` (`routingPreference=TRAFFIC_AWARE`) | Требует биллинг-аккаунт |
| Яндекс | — | Если нужна точность по РФ; уточнить условия API |

> Выбор провайдера — открытый вопрос; при выборе обновить этот раздел и `Core_Architecture.md`.

### 4.2. Алгоритм

```
интервал = PeakHours содержит текущее локальное время ? PeakIntervalMinutes (2) : IntervalMinutes (5)
ночью (по настройке nightMode) — 15 мин, экономия квоты API

для каждого активного маршрута (последовательно, не параллельно — квоты API):
  1. provider.MeasureAsync(route)
  2. baseline = NoTrafficDurationSeconds
               ?? медиана traffic_logs за 4 недели (тот же день недели и час)  [Database_EFCore.md, 7]
               ?? DurationSeconds (первые дни, истории ещё нет)
  3. congestion = Classify(duration / baseline)
  4. trend = сравнение с предыдущим замером этого маршрута (|Δ| ≥ 120 с → up/down)
  5. INSERT в traffic_logs
собрать TrafficDto(routes, updatedAt) → notifier.SendTrafficUpdate()
```

Ошибка по одному маршруту не отменяет остальные: в DTO для него сохраняется предыдущее значение.

### 4.3. Классификация загруженности

Пороги — **те же, что фолбэк на фронте** (`Frontend_react/Feature_Widgets.md`, 2.3). Источник правды — бэкенд (`CongestionClassifier`): `ratio = время с пробками / время по пустой дороге`; превышение < 20 % — Free, 20–50 % — Normal, 50–100 % — Heavy, ≥ 100 % — Severe.

```csharp
public static CongestionLevel Classify(double durationMinutes, double freeFlowMinutes) =>
    (durationMinutes / freeFlowMinutes) switch
    {
        < 1.2 => CongestionLevel.Free,
        < 1.5 => CongestionLevel.Normal,
        < 2.0 => CongestionLevel.Heavy,
        _     => CongestionLevel.Severe,
    };
```

### 4.4. Маппинг в DTO

| Поле `RouteDto` | Вычисление |
|---|---|
| `durationMinutes` | `round(DurationSeconds / 60)` |
| `baselineMinutes` | `round(baseline / 60)` |
| `distanceKm` | `DistanceMeters / 1000`, 1 знак |
| `congestion` | `Classify(...)` → `"free" \| "normal" \| "heavy" \| "severe"` |
| `trend` | `"up" \| "down" \| "flat"` |
| `eta` | `now + DurationSeconds` (UTC ISO) |

---

## 5. TelemetryWorker

### 5.1. Источники данных Linux (Raspberry Pi 5)

| Метрика | Файл | Формат / расчёт |
|---|---|---|
| **CPU %** | `/proc/stat` | Строка `cpu  user nice system idle iowait irq softirq steal …`. Загрузка = `1 − Δidle_all / Δtotal`, где `idle_all = idle + iowait`, по разнице двух замеров. Строки `cpu0..cpu3` — по ядрам. |
| **RAM** | `/proc/meminfo` | `used = MemTotal − MemAvailable` (кБ). Не использовать `MemFree` — он не учитывает кэш. |
| **Температура SoC** | `/sys/class/thermal/thermal_zone0/temp` | Целое в **миллиградусах** (`54250` → `54.25 °C`) |
| **Частота CPU** | `/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq` | кГц → МГц |
| **Аптайм** | `/proc/uptime` | Первое число — секунды с загрузки (дробное) |
| **Троттлинг** (опционально) | `vcgencmd get_throttled` | Требует проброса `/dev/vcio` в контейнер; биты `0x4` (throttled now), `0x8` (soft temp limit). Если недоступно — `throttled = null`, фронт не показывает бейдж. |

> **Docker:** `/proc/stat`, `/proc/meminfo` и `/proc/uptime` внутри контейнера показывают значения **хоста** (они не изолированы namespace'ами, если не используется lxcfs), а `/sys` монтируется read-only по умолчанию. Тем не менее пути вынесены в конфигурацию (`Telemetry:ProcRoot`, `Telemetry:SysRoot`), чтобы при необходимости монтировать хостовые каталоги явно (`/proc:/host/proc:ro`). Подробности — `Infrastructure/Compose_And_Pi.md`.

### 5.2. Читатель телеметрии

> **Текущая реализация:** `Workers/TelemetryWorker.cs` + `Services/Telemetry/` (`ITelemetryReader`, `LinuxTelemetryReader`, `MockTelemetryReader`, `TelemetryOptions`). Реализация выбирается в `Program.cs` через `RuntimeInformation.IsOSPlatform(OSPlatform.Linux)`: на Linux — чтение procfs/sysfs, на macOS/Windows — мок (CPU 5–35 % с редкими пиками, RAM ~2–2.8 ГБ из 8064 МБ, температура 45–55 °C, аптайм = `Environment.TickCount64`). Если файла температуры нет (например, VM Docker Desktop) — `temperatureC = null`. Воркер логирует только первый сбой серии и восстановление, чтобы не писать ошибку каждую секунду. Троттлинг, частота CPU и по-ядерная загрузка пока не собираются.

```csharp
public sealed class LinuxTelemetryReader(IOptions<TelemetryOptions> opt) : ITelemetryReader
{
    private CpuTimes? _prev;   // состояние между вызовами — сервис Singleton

    public TelemetryDto Read(DateTimeOffset now)
    {
        var cpu = CpuTimes.Parse(File.ReadLines(Path.Combine(opt.Value.ProcRoot, "stat")).First());
        var cpuPercent = _prev is null ? 0 : cpu.UsagePercentSince(_prev);
        _prev = cpu;

        var mem = MemInfo.Parse(File.ReadAllLines(Path.Combine(opt.Value.ProcRoot, "meminfo")));
        var tempC = int.Parse(File.ReadAllText(
            Path.Combine(opt.Value.SysRoot, "class/thermal/thermal_zone0/temp"))) / 1000.0;
        var uptime = double.Parse(File.ReadAllText(Path.Combine(opt.Value.ProcRoot, "uptime"))
            .Split(' ')[0], CultureInfo.InvariantCulture);

        return new TelemetryDto(now, Math.Round(cpuPercent, 1), mem.UsedMb, mem.TotalMb,
                                Math.Round(tempC, 1), (long)uptime, Throttled: null, CpuFreqMhz: ReadFreq());
    }
}
```

- Парсинг — **`CultureInfo.InvariantCulture`** обязательно (в `ru-RU` разделитель дроби — запятая).
- Парсеры (`CpuTimes.Parse`, `MemInfo.Parse`) — чистые функции, тестируются на фикстурах реальных файлов с Pi.
- На не-Linux машине разработчика (macOS/Windows) регистрируется `FakeTelemetryReader` с синусоидальными данными (`Telemetry:UseFake=true` или `!OperatingSystem.IsLinux()`).

### 5.3. Алгоритм и производительность

```
каждую Telemetry:IntervalSeconds (1 с), один PeriodicTimer на всё время работы:
  1. dto = reader.Read(now)
  2. state.AddTelemetry(dto)            ← кольцевой буфер 120 точек для snapshot
  3. hub.Clients.All.TelemetryTick(dto)
```

- **Никакой записи в БД** — 86 400 строк в сутки не нужны и изнашивают SD-карту.
- Если клиентов нет (Chromium ещё не запустился) — отправка через `Clients.All` дёшева, пропускать не нужно.
- Бюджет итерации: < 5 мс CPU. Файлы `/proc` и `/sys` виртуальные — чтение быстрое, но без лишних аллокаций (`File.ReadLines(...).First()` вместо чтения всего `/proc/stat`).
- Первая точка после старта даёт `cpuPercent = 0` (нет предыдущего замера) — допустимо; либо делается «прогревочное» чтение при старте воркера.

---

## 6. RetentionWorker

```
раз в сутки в ~03:30 по локальному времени:
  DELETE FROM weather_logs WHERE measured_at < now() - Retention:WeatherDays
  DELETE FROM traffic_logs WHERE measured_at < now() - Retention:TrafficDays
```

- Через `ExecuteDeleteAsync()` — без загрузки сущностей.
- Время запуска считается от `TimeProvider` до ближайшего 03:30, а не «каждые 24 ч от старта контейнера».
- Логирует количество удалённых строк (`Information`).

---

## 7. Тестирование воркеров

| Что | Как |
|---|---|
| Парсеры `/proc`, `/sys` | Unit-тесты на фикстурах, снятых с реального Pi 5 |
| Маппинг Open-Meteo | Unit-тест на сохранённом JSON-ответе API |
| `Classify`, baseline, trend | Unit-тесты граничных значений |
| Цикл воркера | `FakeTimeProvider` (`Microsoft.Extensions.TimeProvider.Testing`): продвижение времени → проверка вызова провайдера и `DashboardNotifier` (мок `IHubContext`) |
| Отказоустойчивость | Провайдер бросает исключение → воркер продолжает работу, следующая итерация выполняется, хост не падает |
| Часы пик | `GetInterval()` возвращает 2/5/15 мин для разного локального времени |
