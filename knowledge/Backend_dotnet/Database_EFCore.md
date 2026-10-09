# Database — PostgreSQL + EF Core (Code-First)

> **Назначение документа:** структура базы данных DeskHub, модели EF Core, конвенции, миграции и политика хранения данных.
> Связанные документы: [`Core_Architecture.md`](Core_Architecture.md), [`Background_Workers.md`](Background_Workers.md), развёртывание БД — [`../Infrastructure/Compose_And_Pi.md`](../Infrastructure/Compose_And_Pi.md).

---

## 1. Роль базы данных

PostgreSQL хранит то, что должно **пережить перезапуск** контейнера и устройства:

| Что | Зачем |
|---|---|
| **История погоды** (`weather_logs`) | Прогрев снимка при старте (последняя запись), будущая аналитика/графики за период |
| **История времени в пути** (`traffic_logs`) | Прогрев снимка, расчёт «типичного» времени (`baselineMinutes`) по истории |
| **Маршруты** (`routes`) | Конфигурация маршрутов «Дом → Работа» и т.д. |
| **Настройки** (`settings`) | Ночной режим, показ секунд и пр. — профиль браузера пересоздаётся при каждом запуске, поэтому настройки живут здесь |

**Что НЕ хранится:** телеметрия Raspberry Pi (1 Гц, ценность только «здесь и сейчас») — она живёт в памяти (`DashboardState`). Это экономит ресурс записи SD-карты/SSD.

---

## 2. Технологии и конвенции

| Параметр | Значение |
|---|---|
| СУБД | PostgreSQL 16 (`postgres:16-bookworm`, есть `arm64`) |
| Провайдер | `Npgsql.EntityFrameworkCore.PostgreSQL` |
| Подход | **Code-First**, миграции в `Infrastructure/Persistence/Migrations/` |
| Именование | `snake_case` для таблиц и колонок (`EFCore.NamingConventions` → `UseSnakeCaseNamingConvention()`) |
| Время | `DateTimeOffset` в C# → `timestamp with time zone`; всегда **UTC** |
| Ключи | `long` identity для логов (большие объёмы, монотонность), `Guid` для справочников (`routes`) |
| Конфигурация сущностей | Fluent API в отдельных `IEntityTypeConfiguration<T>`, без атрибутов на моделях |
| Nullable | `<Nullable>enable</Nullable>` — обязательность колонок выводится из типов |

---

## 3. Модели

### 3.1. ER-схема

```
┌────────────────────┐          ┌───────────────────────────┐
│ routes             │ 1      * │ traffic_logs              │
├────────────────────┤──────────├───────────────────────────┤
│ id          uuid PK│          │ id           bigint PK    │
│ name        text   │          │ route_id     uuid FK      │
│ origin_lat  float8 │          │ measured_at  timestamptz  │
│ origin_lon  float8 │          │ duration_sec int          │
│ dest_lat    float8 │          │ no_traffic_sec int        │
│ dest_lon    float8 │          │ distance_m   int          │
│ sort_order  int    │          │ congestion   text         │
│ is_active   bool   │          └───────────────────────────┘
└────────────────────┘

┌───────────────────────────────┐    ┌─────────────────────────┐
│ weather_logs                  │    │ settings                │
├───────────────────────────────┤    ├─────────────────────────┤
│ id              bigint PK     │    │ key        text PK      │
│ measured_at     timestamptz   │    │ value      jsonb        │
│ temperature_c   real          │    │ updated_at timestamptz  │
│ apparent_temp_c real          │    └─────────────────────────┘
│ weather_code    smallint      │
│ is_day          bool          │
│ precipitation_mm real         │
│ precip_prob_pct smallint      │
│ wind_speed_ms   real          │
│ uv_index        real          │
│ hourly_forecast jsonb         │
└───────────────────────────────┘
```

### 3.2. `WeatherLog` — лог погоды

Одна строка на каждый успешный опрос провайдера погоды (сейчас wttr.in) (раз в 10–15 мин → ~100 строк/сутки).

```csharp
public sealed class WeatherLog
{
    public long Id { get; set; }
    public DateTimeOffset MeasuredAt { get; set; }      // время данных (время наблюдения провайдера, UTC)
    public float TemperatureC { get; set; }
    public float ApparentTemperatureC { get; set; }
    public short WeatherCode { get; set; }              // WMO code
    public bool IsDay { get; set; }
    public float PrecipitationMm { get; set; }
    public short PrecipitationProbabilityPct { get; set; }
    public float WindSpeedMs { get; set; }
    public float UvIndex { get; set; }
    public List<HourlyForecastItem> HourlyForecast { get; set; } = [];   // jsonb
}

public sealed record HourlyForecastItem(
    DateTimeOffset Time, float TemperatureC, short WeatherCode,
    short PrecipitationProbabilityPct, float UvIndex);
```

- Текущие показатели — **отдельные колонки** (по ним возможна аналитика: «температура за месяц»).
- Почасовой прогноз — **`jsonb`** (`.OwnsMany(x => x.HourlyForecast, b => b.ToJson())`): нужен целиком для прогрева снимка, аналитика по нему не требуется.
- Индекс: `measured_at DESC` — выборка последней записи и диапазонов.
- Дубликаты: уникальный индекс по `measured_at` — повторный опрос с теми же данными провайдера погоды не создаёт новую строку (воркер делает upsert / проверяет `ON CONFLICT DO NOTHING`).

### 3.3. `TrafficLog` — лог времени в пути

Одна строка на маршрут на каждый опрос (раз в 2–5 мин × 2 маршрута → ~600–1400 строк/сутки).

```csharp
public sealed class TrafficLog
{
    public long Id { get; set; }
    public Guid RouteId { get; set; }
    public Route Route { get; set; } = null!;
    public DateTimeOffset MeasuredAt { get; set; }
    public int DurationSeconds { get; set; }            // с учётом пробок
    public int? NoTrafficDurationSeconds { get; set; }  // если провайдер отдаёт «без пробок»
    public int DistanceMeters { get; set; }
    public CongestionLevel Congestion { get; set; }     // хранится строкой (HasConversion<string>())
}

public enum CongestionLevel { Free, Normal, Heavy, Severe }
```

- Индекс: `(route_id, measured_at DESC)` — последняя запись по маршруту и выборка истории для baseline.
- Время храним в **секундах** (как отдают API), в минуты переводит маппер DTO.
- `Congestion` сохраняется, чтобы история отражала оценку, показанную в момент замера.

### 3.4. `Route` — маршрут

```csharp
public sealed class Route
{
    public Guid Id { get; set; }
    public required string Name { get; set; }           // «Дом → Работа»
    public double OriginLat { get; set; }
    public double OriginLon { get; set; }
    public double DestinationLat { get; set; }
    public double DestinationLon { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public List<TrafficLog> Logs { get; set; } = [];
}
```

- Начальные маршруты задаются **seed-данными** из конфигурации при первом старте (`Traffic:Routes` в `appsettings`/env), а не захардкожены в миграции (это персональные координаты).
- Удаление маршрута — мягкое (`IsActive = false`), чтобы не терять историю. FK `traffic_logs.route_id` → `ON DELETE CASCADE` на случай физического удаления.

### 3.5. `Setting` — настройки (key-value)

```csharp
public sealed class Setting
{
    public required string Key { get; set; }            // "nightMode", "clock"
    public required JsonDocument Value { get; set; }    // jsonb
    public DateTimeOffset UpdatedAt { get; set; }
}
```

- Key-value + `jsonb` — добавление настроек без миграций.
- Сервис настроек собирает их в типизированный `SettingsDto` и подставляет значения по умолчанию для отсутствующих ключей.

---

## 4. DbContext

```csharp
public sealed class DeskHubDbContext(DbContextOptions<DeskHubDbContext> options) : DbContext(options)
{
    public DbSet<WeatherLog> WeatherLogs => Set<WeatherLog>();
    public DbSet<TrafficLog> TrafficLogs => Set<TrafficLog>();
    public DbSet<Route> Routes => Set<Route>();
    public DbSet<Setting> Settings => Set<Setting>();

    protected override void OnModelCreating(ModelBuilder b)
        => b.ApplyConfigurationsFromAssembly(typeof(DeskHubDbContext).Assembly);
}
```

Правила использования:
- В воркерах — **новый scope на каждую итерацию** (`await using var scope = scopeFactory.CreateAsyncScope()`), контекст живёт коротко.
- Чтение — `AsNoTracking()`.
- Никаких `Include` «на всякий случай» и N+1 — запросы точечные.

---

## 5. Миграции

### 5.1. Создание

```bash
dotnet ef migrations add <Name> \
  --project src/DeskHub.Api \
  --output-dir Infrastructure/Persistence/Migrations
```

- Имя миграции отражает суть: `AddTrafficLogs`, `AddWeatherHourlyJson`.
- Сгенерированная миграция **ревьюится** перед коммитом (особенно удаления и переименования колонок).

### 5.2. Применение: автоматически при старте

DeskHub — одно устройство с одним экземпляром приложения, поэтому миграции применяются **при старте API**:

```csharp
public static async Task ApplyMigrationsAsync(this WebApplication app)
{
    await using var scope = app.Services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<DeskHubDbContext>();
    var log = scope.ServiceProvider.GetRequiredService<ILogger<DeskHubDbContext>>();

    for (var attempt = 1; ; attempt++)
    {
        try { await db.Database.MigrateAsync(); break; }
        catch (Exception ex) when (attempt < 10)
        {
            log.LogWarning(ex, "DB not ready, retry {Attempt}", attempt);
            await Task.Delay(TimeSpan.FromSeconds(3 * attempt));
        }
    }
}
```

- Ретраи страхуют холодный старт Pi, когда PostgreSQL поднимается дольше API (дополнительно к `depends_on: condition: service_healthy` в compose).
- Перед обновлением образа с миграциями — бэкап БД (см. `Infrastructure/Compose_And_Pi.md`).

---

## 6. Политика хранения (retention)

| Таблица | Срок по умолчанию | Объём (оценка) |
|---|---|---|
| `weather_logs` | 90 дней | ~9 тыс. строк |
| `traffic_logs` | 180 дней | ~250 тыс. строк |

- Очистку выполняет `RetentionWorker` раз в сутки (ночью) через `ExecuteDeleteAsync()` — без загрузки сущностей в память.
- Сроки настраиваются в секции `Retention` конфигурации.
- Объёмы малы для PostgreSQL; ограничение нужно, чтобы БД не росла бесконечно на SD-карте за годы работы.

---

## 7. Запросы-примеры

```csharp
// Последняя погода — для прогрева DashboardState при старте
var last = await db.WeatherLogs.AsNoTracking()
    .OrderByDescending(x => x.MeasuredAt)
    .FirstOrDefaultAsync(ct);

// Типичное время в пути: медиана за последние 4 недели в тот же день недели и час (±30 мин)
// Считается в БД через percentile_cont, если провайдер не отдаёт «время без пробок».
var baselineSec = await db.Database.SqlQuery<double?>($"""
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_seconds) AS "Value"
    FROM traffic_logs
    WHERE route_id = {routeId}
      AND measured_at > now() - interval '28 days'
      AND extract(isodow FROM measured_at AT TIME ZONE {tz}) = {isoDow}
      AND abs(extract(epoch FROM (measured_at AT TIME ZONE {tz})::time - {localTime}::time)) <= 1800
    """).SingleAsync(ct);
```

---

## 8. Резервное копирование

- `pg_dump` по cron на хосте (раз в сутки) в каталог вне SD-карты либо на сетевое хранилище — команды в `Infrastructure/Compose_And_Pi.md`.
- Потеря БД не критична для работы экрана (данные восстановятся с первым опросом), но теряются история и настройки.
