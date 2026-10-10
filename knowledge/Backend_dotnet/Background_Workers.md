# Background Workers — фоновые сервисы

> **Назначение документа:** логика фоновых сервисов DeskHub на базе `BackgroundService`: опрос внешних API и хоста, запись в БД, рассылка через SignalR.
> Связанные документы: [`Core_Architecture.md`](Core_Architecture.md) (DI, `DashboardNotifier`), [`Database_EFCore.md`](Database_EFCore.md) (модели), клиентская сторона — [`../Frontend_react/Feature_Widgets.md`](../Frontend_react/Feature_Widgets.md).

---

## 1. Обзор

| Воркер | Источник | Интервал | Пишет в БД | SignalR-событие |
|---|---|---|---|---|
| `WeatherWorker` | wttr.in (HTTPS, JSON `format=j1`) | 15 мин | `weather_logs` (план) | `WeatherUpdated` |
| `TrafficWorker` | API карт (HTTPS) | 5 мин, в часы пик 2 мин | `traffic_logs` | `TrafficUpdated` |
| `TelemetryWorker` | `/proc`, `/sys` хоста | 1 с | — (только память) | `TelemetryTick` |
| `CalendarWorker` | Несколько .ics (iCloud, Outlook) параллельно | 15 мин (сбой — повтор через 2 мин) | — (только память) | `CalendarUpdated` |
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

> **Текущая реализация — wttr.in (с 09.10.2026).** Open-Meteo (хостится в Hetzner) недоступен из сети пользователя — провайдер в РФ блокирует дата-центр, отсюда таймауты `HttpClient.Timeout`. Обход блокировок не делаем: провайдер погоды заменён на **wttr.in** (бесплатно, без ключа, работает в РФ). **Фронтенд не менялся**: бэкенд отдаёт ту же `WeatherModel`.
>
> - Запрос: `GET https://wttr.in/{Weather:City}?format=j1&lang=ru` (по умолчанию `Moscow`), named `HttpClient` `"Weather"`: таймаут **30 с**, `User-Agent: DeskHub/1.0 (Raspberry Pi)`, `Accept: application/json`. Интервал 15 мин; сбой — `Warning`, повтор через 1, 2, 4 … мин, клиентам ничего не рассылается (в `DashboardState` остаётся прежняя погода или `null`).
> - Код: `Workers/WeatherWorker.cs` + `Services/Weather/` — `WeatherOptions` (`City`, `LocationName`, `IntervalMinutes`, `TimeZone`, `BaseUrl`), `WttrResponse` (внутренние record'ы; все числа wttr.in присылает **строками** — `JsonNumberHandling.AllowReadingFromString`), `WttrMapper`, `WwoCodes`. Конфигурация: секция `Weather` (`Weather__City`, `Weather__LocationName` в `.env`); ключи `OpenMeteo:*` (координаты) удалены.
>
> | Поле `WeatherModel` | Источник wttr.in |
> |---|---|
> | `temperature` / `apparentTemperature` | `current_condition[0].temp_C` / `FeelsLikeC` |
> | `description` | `current_condition[0].lang_ru[0].value` («Пасмурно», «Небольшой дождь»), иначе `weatherDesc[0].value`; первая буква заглавная |
> | `icon` | код WorldWeatherOnline `current_condition[0].weatherCode` → `WwoCodes`: 113 → `clear-day/night`; 116 → `partly-cloudy-day/night`; 119, 122 → `cloudy`; 143, 248, 260 → `fog`; 176, 263, 266 → `drizzle`; 293–308, 353–359 → `rain`; 182, 185, 281, 284, 311–320, 350, 362, 365, 374, 377 → `sleet`; 179, 227, 230, 323–338, 368, 371 → `snow`; 200, 386–395 → `thunderstorm`; неизвестный → `cloudy`. Ключи иконок — прежний контракт с фронтендом |
> | `weatherCode` | эквивалентный WMO-код той же категории (0, 2, 3, 45, 51, 61, 66, 71, 95) — смысл поля сохранён (фронтенд его не использует) |
> | `isDay` | местное время между `weather[сегодня].astronomy[0].sunrise` и `sunset` («06:48 AM»); без астрономии — 07:00–20:00 |
> | `precipitation` / `uvIndex` | `precipMM` / `uvIndex` |
> | `hourly[]` | `weather[0..2].hourly[]` — **шаг 3 ч** (`time` = "0", "300" … "2100", местное время города → `DateTimeOffset` по `Weather:TimeZone`), начиная с текущего трёхчасового блока, 16 точек (2 суток); `precipitationProbability` = max(`chanceofrain`, `chanceofsnow`); иконка — по коду часа и восходу/закату его дня |
> | `locationName` | `Weather:LocationName` |
> | `astronomy.sunrise` / `sunset` | `weather[сегодня].astronomy[0].sunrise` / `sunset` → абсолютный `DateTimeOffset` (дата дня + время, смещение `Weather:TimeZone`); `null` — «No sunrise»/«No sunset» (полярный день/ночь) или не разобрано |
> | `astronomy.nextSunrise` | восход следующего дня ответа (`weather[завтра]`) — конец ночной дуги Луны |
> | `astronomy.moonPhase` | `moon_phase` («Waxing Crescent») → enum `MoonPhase` (пробелы убираются, регистр не важен; «Third Quarter» = `LastQuarter`; неизвестное — `Unknown`), в JSON — camelCase (`waxingCrescent`) |
> | `astronomy.moonIllumination` | `moon_illumination` ("0"…"100", строка → int), зажат в 0–100 |
>
> **Формат времени астрономии.** wttr.in отдаёт восход/закат в **12-часовом формате** («06:48 AM», «05:45 PM») независимо от `lang`. `WttrMapper.TryParseClock` разбирает строку `DateTime.TryParseExact` с **инвариантной культурой** (AM/PM не зависят от локали сервера/контейнера) и набором форматов `hh:mm tt`, `h:mm tt`, `hh:mmtt`, `h:mmtt`, `HH:mm`, `H:mm` (на случай смены формата — без ведущего нуля, без пробела, 24 ч); строка предварительно приводится к верхнему регистру («am» → «AM»). Время — местное время города, поэтому к дате дня добавляется смещение `Weather:TimeZone` на этот момент (корректно и в дни перехода на летнее время). Тот же разбор используется для `isDay`.
>
> Следствие шага 3 ч: фронтенд (`selectForecast`) выбирает часы из того, что есть, поэтому в режиме «Сегодня» бывает 4 слота вместо 5, а «Вечером» — 2–3 (12:00 → 12, 15, 18, 21). Режим «Завтра» (09, 12, 15, 18, 21) — без изменений.
>
> Проверено 09.10.2026: ответ за ~1 с; «13 °C, Пасмурно (cloudy)», день; прогноз — 18:00 `drizzle` 48 %, 21:00 `rain` 40 %, 00:00 `clear-night`; виджет на экране отрисовался без изменений фронтенда.
>
> Подразделы 3.1–3.3 ниже описывают прежнюю интеграцию с Open-Meteo (до 09.10.2026) — оставлены как история.


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

> *(Историческое — Open-Meteo, до 09.10.2026.)*

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

> **«Спящий режим» (Sleep Mode).** Пробки видны только в левой нижней ячейке главного экрана (мини-карусель «Пробки ↔ Кот»), а большую часть дня там кот. Чтобы не спамить Яндекс зря (и не рисковать капчей), воркер засыпает, пока виджет не виден:
> - `Services/Traffic/TrafficActivityTracker.cs` (singleton): `LastTrafficActivity` (при старте = сейчас — первый запрос делается сразу), время последнего запроса, флаг сна и **канал пробуждения** — `Channel<string>` ёмкостью 1 с `DropWrite` (лишние сигналы схлопываются).
> - Клиент пингует `DashboardHub.ReportTrafficVisible()` раз в 90 с, пока пробки на экране, и вызывает `ForceTrafficRefresh()`, если при показе данные старше 15 мин.
> - **Засыпание:** перед каждым плановым запросом воркер проверяет `now − LastTrafficActivity > Traffic:IdleMinutes` (10). Если да — пишет `TrafficWorker is sleeping...` (один раз), в Яндекс не ходит и ждёт `activity.WaitAsync(30 с)` — сигнала или 30-секундной перепроверки. Проверка идёт в момент очередного запроса, поэтому после 10 минут без пингов не делается ни одного лишнего запроса.
> - **Мгновенное пробуждение:** все ожидания воркера — не `Task.Delay`, а `WaitAsync(timeout)` = `channel.Reader.ReadAsync` с отменой по таймауту (`CancellationTokenSource(timeout, TimeProvider)`), что раньше. `ReportTrafficVisible` пишет сигнал, **только если воркер спит** — он просыпается сразу (`TrafficWorker woke up — fetching now`) и делает запрос, не дожидаясь 30 с; пинги бодрствующему воркеру лишних запросов не порождают. `ForceTrafficRefresh` будит и спящий воркер, и **паузу между запросами** (4–7 мин) — но не чаще раза в минуту после последнего запроса (иначе `ignored`). После каждого запроса канал очищается (`MarkFetched`), чтобы пришедший во время запроса сигнал не вызвал повторный запрос.
> - Проверено (Mock-провайдер, `IntervalMinutes=1`, `IdleMinutes=0.5`): воркер уснул после первого планового интервала; `ReportTrafficVisible` из SignalR-клиента — пробуждение и запрос в пределах 2 с; `ForceTrafficRefresh` через 2 с после запроса — проигнорирован; через 62 с — прервал паузу 124 с и сделал запрос; в браузере с котом на экране воркер продолжал спать, свайп ячейки на пробки — сразу `woke up` и запрос.

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
| Маппинг wttr.in (`WttrMapper`, `WwoCodes`) | Unit-тест на сохранённом JSON-ответе `format=j1` |
| `Classify`, baseline, trend | Unit-тесты граничных значений |
| Цикл воркера | `FakeTimeProvider` (`Microsoft.Extensions.TimeProvider.Testing`): продвижение времени → проверка вызова провайдера и `DashboardNotifier` (мок `IHubContext`) |
| Отказоустойчивость | Провайдер бросает исключение → воркер продолжает работу, следующая итерация выполняется, хост не падает |
| Часы пик | `GetInterval()` возвращает 2/5/15 мин для разного локального времени |

---

## 8. CalendarWorker (несколько календарей: iCloud, Outlook, .ics)

`Workers/CalendarWorker.cs` (бывший `AppleCalendarWorker`) + `Services/Calendar/` (`CalendarOptions`, `IcsCalendarParser`, `CalendarRange`); пакет **Ical.Net 5.2.3**.

### 8.1. Конфигурация

Календари — массив `Calendar:Sources`, у каждого `Url` (webcal:// или https://) и `Color` (#RRGGBB, палитра iOS; проверяется при старте):

| Источник | Цвет |
|---|---|
| iCloud — личный | `#34C759` (зелёный) |
| iCloud — второй | `#007AFF` (синий) |
| iCloud — третий | `#AF52DE` (лиловый) |
| Outlook (Office 365, «Опубликовать календарь» → .ics) | `#FF9500` (оранжевый) |

| Ключ | По умолчанию | Смысл |
|---|---|---|
| `Calendar__Sources__N__Url` / `__Color` | пусто | Массив календарей (в JSON — `Calendar:Sources:[{ Url, Color }]`). Пусто — воркер не стартует (`Warning`), фронтенд: «Календарь не подключён». |
| `Calendar__WebcalUrl` | пусто | Устаревший одиночный URL — используется, только если `Sources` пуст (цвет `#007AFF`). |
| `Calendar__IntervalMinutes` | 15 | Интервал загрузки |
| `Calendar__DaysAhead` | 7 | Дней вперёд от сегодня |
| `Calendar__TimeZone` | `Europe/Moscow` (в compose — из `TZ`) | Пояс устройства (IANA). В образе `aspnet:10.0` есть `/usr/share/zoneinfo`. |

**Секреты.** Публичные ссылки iCloud/Outlook открывают календарь **без пароля**, поэтому реальные адреса **никогда не попадают в git**:
- Docker / Pi — в `.env` (в `.gitignore`); compose передаёт его в сервис `api` целиком (`env_file: [{ path: .env, required: false }]`) — так проходит массив `Calendar__Sources__N__*`.
- Локальный `dotnet run` (Development) — .NET user-secrets (`UserSecretsId` в `DeskHub.Api.csproj`, значения в `~/.microsoft/usersecrets/…`, вне репозитория): `dotnet user-secrets set "Calendar:Sources:0:Url" "webcal://…"`.
- `.env.example` и `appsettings*.json` (в git) содержат только структуру и цвета с заглушками вместо токенов.
- **Логи:** воркер пишет только номер и хост источника (`#3 outlook.office365.com`), из текста ошибок URL вырезается. Встроенное логирование `HttpClient` (`Start processing HTTP request GET <полный URL>`, уровень Information) **отключено** для клиента календарей (`.RemoveAllLoggers()`), а категория `System.Net.Http.HttpClient` поднята до `Warning` в `appsettings.json`. Проверено: в логе локального запуска и Docker-контейнера токенов ссылок — 0.

### 8.2. Алгоритм

```
каждые 15 мин:
  1. range = [сегодня 00:00; max(сегодня + DaysAhead + 1 день, 1-е число следующего месяца))
  2. Все источники ПАРАЛЛЕЛЬНО (Task.WhenAll); для каждого — свой try/catch:
       webcal:// → https://, GET (HttpClient "Calendar": таймаут 30 с, gzip/br, редиректы)
       Ical.Net: Calendar.Load → GetOccurrences(сегодня − 31 день).TakeWhileBefore(конец range)
       (RRULE/RDATE/EXDATE разворачивает Ical.Net), фильтр пересечения с range, до 300 событий на календарь
       каждому событию — Color его календаря
  3. Успех источника → запомнить его события (кэш по индексу).
     Сбой источника → Warning с номером и хостом; вместо него — события из последней успешной загрузки
     этого источника (если ей < 6 ч; закончившиеся до начала range отбрасываются) — события не «мигают».
  4. Слияние всех источников в один плоский список: сортировка по StartTime, в один момент — сначала «весь день», затем по названию
  5. CalendarModel { events, rangeStart, rangeEnd, updatedAt } → DashboardNotifier.SendCalendarUpdate
  6. Следующий цикл: через 15 мин, если загрузились все; через 2 мин, если был сбой.
     Сбой всех без кэша → ничего не рассылается, на экране прежние данные.
```

Проверено (08.10.2026): 4 реальных календаря загружаются одновременно (ответы приходят в произвольном порядке), 52 события за 08.10–31.10 — 10 + 3 + 36 из iCloud и 3 из Outlook; Outlook (Windows-имена часовых поясов в TZID) корректно приводится к `+03:00` и на macOS, и в Linux-контейнере. С пятым заведомо недоступным источником: «52 events from 4/5 calendars», остальные не пострадали.

### 8.3. Время (проверено на тестовом .ics)

| Вид события в .ics | Как читается | Пример |
|---|---|---|
| `DTSTART;TZID=Europe/Moscow:…` (или Windows-имя пояса у Outlook) | `AsUtc` → пояс устройства | стендап 10:15 MSK → `10:15+03:00` |
| `DTSTART:…Z` (UTC) | `AsUtc` → пояс устройства | 15:00Z → `18:00+03:00` |
| `DTSTART:20261009T193000` («плавающее», без пояса) | **как время устройства** — `AsUtc` Ical.Net считает его UTC, что сдвинуло бы событие на +3 ч | `19:30+03:00`, не 22:30 |
| `DTSTART;VALUE=DATE:20261008` («весь день») | полночь даты в поясе устройства, `isAllDay = true`, конец не включительно | 08.10 00:00 → 09.10 00:00 |
| `RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` + `EXDATE` | развёрнуто по дням, исключённая дата пропущена | стендап 09.10 отсутствует |
| Многодневное `VALUE=DATE` 06.10–11.10 | попадает, хотя началось до диапазона | «Командировка» видна 08.10 и 09.10 |

### 8.4. Контракт

`CalendarEventModel { title, startTime, endTime, isAllDay, location, color }` (время — ISO со смещением пояса устройства, `color` — #RRGGBB календаря), `CalendarModel { events, rangeStart, rangeEnd, updatedAt }`; событие хаба `CalendarUpdated`; в snapshot — поле `calendar` (`null`, если не подключён или ещё не загружен).

---

## 9. PowerModeService — режим питания экрана

`Services/Power/PowerModeService.cs` (singleton + `IHostedService`, регистрируется раньше воркеров), `PowerOptions` (секция `Power`), модель `Models/PowerModeModel.cs`.

| Режим | По умолчанию (МСК, `Power:TimeZone`) | Настройки |
|---|---|---|
| `Normal` | 08:00–00:00 | `Power:NormalFrom` |
| `Dimmed` | 00:00–01:30 | `Power:DimFrom` |
| `Sleep` | 01:30–08:00 | `Power:SleepFrom` |

- **`Current` вычисляется на лету** из часов (`TimeProvider`) и полей `_wakeUntil` / `_forcedSleepUntil` (под `Lock`): воркеры просто спрашивают `power.IsSleeping` и всегда получают точный ответ.
- **Уведомление клиентов без опроса:** один таймер `time.CreateTimer` взводится ровно на ближайшую возможную смену режима — границу расписания (00:00 / 01:30 / 08:00), конец временного пробуждения или конец принудительного сна. При срабатывании режим пересчитывается; если он сменился — `DashboardState.SetPowerMode` и рассылка `PowerModeChanged(PowerModeModel { mode, wakeUntil, changedAt })`; таймер взводится на следующую смену.
- **Временное пробуждение** — метод хаба `WakeScreen()` → `WakeTemporarily()`: только если по расписанию `Sleep` и пробуждение ещё не идёт — `_wakeUntil = now + Power:WakeMinutes` (5); режим сразу `Dimmed` (рассылка), таймер взводится на `_wakeUntil` → ровно через 5 мин снова `Sleep`. Повторные касания во время пробуждения его не продлевают (слой затемнения пропускает касания к интерфейсу, `WakeScreen` вызывается только с чёрного экрана).
- **Принудительный сон** — метод хаба `SetSleepMode()` → `SleepNow()` (кнопка «В режим сна» в карточке «Система»): в любое время суток `_wakeUntil = null` (активное пробуждение сброшено), `_forcedSleepUntil` = ближайшее наступление `Power:NormalFrom` (08:00) — режим сразу `Sleep` (рассылка `PowerModeChanged`), воркеры перестают ходить в сеть. Снимается:
  - **касанием** — `WakeTemporarily()` сначала обнуляет `_forcedSleepUntil`, дальше обычная логика: днём режим по расписанию (`Normal`, рассылка), в ночном Sleep по расписанию — затемнённое пробуждение на 5 мин; лог «Manual sleep cancelled by touch»;
  - **утром** — таймер срабатывает в `_forcedSleepUntil`, экран включается сам (на случай, если сон включили вечером и не трогали экран).
- **Аппаратное отключение дисплея** (`DisplayHostClient`, `Infrastructure/Hardware_Display_Power.md`): матрица не поддерживает DDC/CI, поэтому экран гасит демон на хосте снятием HDMI-сигнала. При публикации смены режима: **вход в `Sleep`** (по любой причине — расписание, `SetSleepMode`, конец 5-мин пробуждения) → фоновый `POST {Power:DisplayHostUrl}sleep`; **выход из `Sleep`** → `POST …wake` (утром экран включается без касания). Запросы — fire-and-forget в цепочку (не обгоняют друг друга), таймаут 2 с, ошибка — `LogWarning("Display host unavailable …")`, бэкенд не падает (разработка на Mac без демона). `Power:DisplayHostUrl` по умолчанию `http://host.docker.internal:5055/`, пусто — выключено. Касание погашенного экрана ловит демон (evdev) и вызывает **`POST /api/system/wake`** → `WakeTemporarily()` (днём `Normal`, ночью `Dimmed` на 5 мин) + `PowerModeChanged`.
- **Воркеры в режиме Sleep** (`power.IsSleeping`):
  - `WeatherWorker`, `CalendarWorker` — пропускают обновление и проверяют режим раз в минуту (`Task.Delay(1 мин)`), поэтому утром или после касания экрана данные обновляются в течение минуты; в лог — один раз «power mode Sleep — skipping updates» и «resuming».
  - `TrafficWorker` — режим Sleep — ещё одна причина его «спящего режима» (наравне с невидимостью виджета 10 мин): «TrafficWorker is sleeping... (power mode Sleep)».
  - **Первая загрузка после старта выполняется всегда**, даже ночью — иначе после перезапуска контейнера ночью (деплой, отключение питания) при пробуждении экрана не было бы ни погоды, ни календаря («Календарь не подключён»). Проверено: старт в Sleep → погода, календарь и пробки загружены один раз, далее пропуск.
  - `TelemetryWorker` не затронут: он читает локальные `/proc` и `/sys`, в сеть не ходит.
