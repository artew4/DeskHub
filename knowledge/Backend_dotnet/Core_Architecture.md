# Backend Core — архитектура ASP.NET Core

> **Назначение документа:** базовая архитектура серверной части DeskHub: структура решения, pipeline middleware, раздача React-билда, SignalR Hub `/hubs/dashboard`, REST-эндпоинты и регистрация зависимостей (DI).
> Связанные документы: [`Database_EFCore.md`](Database_EFCore.md), [`Background_Workers.md`](Background_Workers.md), контракт клиента — [`../Frontend_react/Feature_Widgets.md`](../Frontend_react/Feature_Widgets.md).

---

## 1. Роль бэкенда

Один процесс ASP.NET Core на Raspberry Pi выполняет четыре задачи:

1. **Раздаёт фронтенд** — статические файлы React-билда из `wwwroot/` + SPA fallback на `index.html`.
2. **Отдаёт REST** — начальный снимок состояния, команды (настройки), healthcheck.
3. **Пушит real-time данные** — SignalR Hub `/hubs/dashboard`.
4. **Собирает данные в фоне** — `BackgroundService`-воркеры опрашивают внешние API и хост, пишут в PostgreSQL и рассылают обновления.

| Параметр | Значение |
|---|---|
| Runtime | .NET 8 (LTS) или .NET 9 — выбирается один, фиксируется в `global.json` |
| Hosting | Kestrel, без reverse proxy (только localhost) |
| Порт в контейнере | `8080` (дефолт образов `aspnet` с .NET 8), наружу — `localhost:5000` |
| Сериализация | `System.Text.Json`, camelCase, enum как строки в camelCase |
| Время | Всё хранится и передаётся в **UTC** (ISO 8601) |

---

## 2. Структура решения

Проект небольшой, поэтому используется **один веб-проект с разбиением по фичам** (vertical slices) + проект тестов. Разделение на отдельные сборки (Domain/Infrastructure) не вводится, пока для этого нет причины.

```
backend/
├── DeskHub.sln
├── global.json
├── src/DeskHub.Api/
│   ├── Program.cs                     # composition root: DI + pipeline
│   ├── appsettings.json
│   ├── appsettings.Development.json
│   ├── Hubs/
│   │   ├── DashboardHub.cs            # Hub<IDashboardClient>
│   │   ├── IDashboardClient.cs        # строго типизированные события клиента
│   │   └── HubEvents.cs               # имена событий (зеркало фронтового hubEvents.ts)
│   ├── Features/
│   │   ├── Dashboard/                 # SnapshotEndpoint, DashboardState (in-memory кэш)
│   │   ├── Weather/                   # WeatherWorker, OpenMeteoClient, DTO, маппинг
│   │   ├── Traffic/                   # TrafficWorker, ITrafficProvider, DTO
│   │   ├── Telemetry/                 # TelemetryWorker, LinuxTelemetryReader, DTO
│   │   └── Settings/                  # эндпоинты настроек, SettingsChanged
│   ├── Infrastructure/
│   │   ├── Persistence/               # DeskHubDbContext, конфигурации, Migrations/
│   │   ├── Retention/                 # RetentionWorker
│   │   └── Http/                      # политики Polly/Resilience для HttpClient
│   ├── Options/                       # *Options классы (strongly-typed config)
│   └── wwwroot/                       # ← React-билд (в git не хранится, кладётся при сборке)
└── tests/DeskHub.Tests/               # xUnit: мапперы, парсеры /proc, расчёт congestion
```

---

## 3. Pipeline middleware

### 3.1. Порядок

```csharp
var app = builder.Build();

await app.ApplyMigrationsAsync();              // см. Database_EFCore.md

if (!app.Environment.IsDevelopment())
    app.UseExceptionHandler("/error");         // ProblemDetails, без стектрейсов

app.UseStaticFiles(new StaticFileOptions      // 1. статика React-билда
{
    OnPrepareResponse = ctx => SetCacheHeaders(ctx.Context),
});

app.UseRouting();                              // 2. маршрутизация

app.MapHealthChecks("/health");                // 3. healthcheck (для compose и kiosk-скрипта)
app.MapDashboardApi();                         // 4. REST: /api/*
app.MapHub<DashboardHub>("/hubs/dashboard");   // 5. SignalR

app.MapFallbackToFile("index.html", new StaticFileOptions   // 6. SPA fallback — всегда последним
{
    OnPrepareResponse = ctx => ctx.Context.Response.Headers.CacheControl = "no-cache",
});

app.Run();
```

### 3.2. Ключевые решения

| Решение | Причина |
|---|---|
| **Нет `UseHttpsRedirection`, HSTS, CORS** | Трафик идёт только по `localhost` внутри устройства, единый origin. |
| **Нет `UseAuthentication`/`UseAuthorization`** | Порт API слушает только `127.0.0.1` хоста (см. `Infrastructure/Compose_And_Pi.md`). Если API когда-нибудь станет доступен по LAN — вводится API-ключ/аутентификация и этот документ обновляется. |
| **`UseStaticFiles`, а не `MapStaticAssets` (.NET 9)** | `MapStaticAssets` строит манифест при `dotnet publish` из содержимого проекта, а React-билд копируется в `wwwroot` отдельным шагом Docker-сборки. `UseStaticFiles` работает с любым содержимым `wwwroot` в рантайме. |
| **`MapFallbackToFile` последним** | Любой не-API путь отдаёт `index.html`. Пути `/api/*` и `/hubs/*` не должны попадать в fallback — неизвестный `/api/...` должен давать 404, а не HTML. |

### 3.3. Кэширование статики

```csharp
static void SetCacheHeaders(HttpContext ctx)
{
    var path = ctx.Request.Path.Value ?? "";
    ctx.Response.Headers.CacheControl = path.StartsWith("/assets/")
        ? "public, max-age=31536000, immutable"   // хэшированные файлы Vite
        : "no-cache";                             // index.html, favicon и пр.
}
```

После обновления контейнера Kiosk при следующей загрузке получает новый `index.html` и, соответственно, новые хэшированные бандлы.

---

## 4. SignalR Hub

### 4.1. Строго типизированный хаб

```csharp
public interface IDashboardClient
{
    Task WeatherUpdated(WeatherDto dto);
    Task TrafficUpdated(TrafficDto dto);
    Task TelemetryTick(TelemetryDto dto);
    Task SettingsChanged(SettingsDto dto);
}

public sealed class DashboardHub(ILogger<DashboardHub> logger) : Hub<IDashboardClient>
{
    public override Task OnConnectedAsync()
    {
        logger.LogInformation("Kiosk connected: {ConnectionId}", Context.ConnectionId);
        return base.OnConnectedAsync();
    }
}
```

- Имена методов `IDashboardClient` **являются именами событий** на клиенте и должны совпадать с `HubEvents` во фронтенде.
- Хаб **не содержит бизнес-логики** и не принимает команд от клиента — канал однонаправленный (сервер → клиент). Команды идут через REST.
- Все клиенты получают одинаковые данные → рассылка через `Clients.All`. Группы не нужны (возможны в будущем при нескольких экранах).

### 4.2. Отправка из воркеров

Воркеры отправляют события через `IHubContext<DashboardHub, IDashboardClient>`, а не через сам хаб:

```csharp
public sealed class DashboardBroadcaster(
    IHubContext<DashboardHub, IDashboardClient> hub,
    DashboardState state) : IDashboardBroadcaster
{
    public async Task PublishWeatherAsync(WeatherDto dto, CancellationToken ct)
    {
        state.SetWeather(dto);                      // 1. обновить in-memory снимок
        await hub.Clients.All.WeatherUpdated(dto);  // 2. разослать клиентам
    }
    // аналогично Traffic / Telemetry / Settings
}
```

Правило: **сначала обновляется `DashboardState`, потом пуш** — тогда клиент, переподключившийся между этими шагами, получит актуальный snapshot.

### 4.3. Настройки SignalR

```csharp
builder.Services
    .AddSignalR(o =>
    {
        o.KeepAliveInterval = TimeSpan.FromSeconds(10);       // = withKeepAliveInterval на клиенте
        o.ClientTimeoutInterval = TimeSpan.FromSeconds(30);   // = withServerTimeout на клиенте
        o.EnableDetailedErrors = builder.Environment.IsDevelopment();
    })
    .AddJsonProtocol(o =>
    {
        o.PayloadSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        o.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
    });
```

- Клиент подключается **только по WebSockets** со `skipNegotiation: true` — серверу ничего дополнительно настраивать не нужно.
- Интервалы keep-alive/timeout согласованы с фронтом (`Frontend_react/Core.md`, раздел 5.2). Меняются только парой.
- MessagePack не используется: объём данных мал, JSON проще отлаживать.

---

## 5. Состояние дашборда и REST API

### 5.1. `DashboardState` — in-memory снимок

Singleton, хранящий **последнее известное значение** каждого виджета и кольцевой буфер истории телеметрии (120 точек).

```csharp
public sealed class DashboardState
{
    private volatile WeatherDto? _weather;
    private volatile TrafficDto? _traffic;
    private readonly TelemetryHistory _telemetry = new(capacity: 120);  // потокобезопасный ring buffer

    public void SetWeather(WeatherDto dto) => _weather = dto;
    public void SetTraffic(TrafficDto dto) => _traffic = dto;
    public void AddTelemetry(TelemetryDto dto) => _telemetry.Add(dto);

    public SnapshotDto GetSnapshot(SettingsDto settings, DateTimeOffset now) => new(
        _weather, _traffic, _telemetry.ToSnapshot(), settings, now);
}
```

- При старте приложения погода и пробки **прогреваются из БД** (последняя запись), чтобы snapshot не был пустым до первого опроса внешних API.
- Snapshot не ходит в БД на каждый запрос — только в память.

### 5.2. Эндпоинты (Minimal API)

| Метод | Путь | Ответ | Назначение |
|---|---|---|---|
| `GET` | `/api/dashboard/snapshot` | `SnapshotDto` | Полный снимок при старте клиента и после реконнекта |
| `GET` | `/api/settings` | `SettingsDto` | Текущие настройки |
| `PUT` | `/api/settings` | `204` | Изменение настроек → сохранение в БД → `SettingsChanged` всем клиентам |
| `GET` | `/api/routes` | `RouteConfigDto[]` | Список маршрутов для пробок |
| `GET` | `/health` | `200 Healthy` / `503` | Liveness + проверка БД |

```csharp
public sealed record SnapshotDto(
    WeatherDto? Weather,
    TrafficDto? Traffic,
    TelemetrySnapshotDto? Telemetry,
    SettingsDto Settings,
    DateTimeOffset ServerTime);   // клиент сверяет с локальными часами (Feature_Dashboard.md, 3.3)
```

### 5.3. DTO

- DTO — `record`-типы в папке своей фичи; **зеркалят** TypeScript-типы из `Frontend_react/Feature_Widgets.md`.
- Сущности EF Core **никогда** не отдаются наружу напрямую — только через маппинг в DTO.
- Перечисления сериализуются строками (`CongestionLevel.Heavy` → `"heavy"`).

---

## 6. Dependency Injection

### 6.1. Регистрация (эскиз `Program.cs`)

```csharp
var builder = WebApplication.CreateBuilder(args);

// --- Options (валидация при старте) ---
builder.Services.AddOptions<WeatherOptions>()
    .BindConfiguration("Weather").ValidateDataAnnotations().ValidateOnStart();
builder.Services.AddOptions<TrafficOptions>()
    .BindConfiguration("Traffic").ValidateDataAnnotations().ValidateOnStart();
builder.Services.AddOptions<TelemetryOptions>()
    .BindConfiguration("Telemetry").ValidateDataAnnotations().ValidateOnStart();
builder.Services.AddOptions<RetentionOptions>().BindConfiguration("Retention");

// --- Persistence ---
builder.Services.AddDbContext<DeskHubDbContext>(o => o
    .UseNpgsql(builder.Configuration.GetConnectionString("DeskHub"))
    .UseSnakeCaseNamingConvention());

// --- HTTP-клиенты внешних API (с ретраями и таймаутами) ---
builder.Services.AddHttpClient<IOpenMeteoClient, OpenMeteoClient>(c =>
        c.BaseAddress = new Uri("https://api.open-meteo.com/"))
    .AddStandardResilienceHandler();
builder.Services.AddHttpClient<ITrafficProvider, TomTomTrafficProvider>()   // реализация выбирается конфигом
    .AddStandardResilienceHandler();

// --- Состояние и рассылка ---
builder.Services.AddSingleton<DashboardState>();
builder.Services.AddSingleton<IDashboardBroadcaster, DashboardBroadcaster>();
builder.Services.AddSingleton<ITelemetryReader, LinuxTelemetryReader>();
builder.Services.AddSingleton(TimeProvider.System);

// --- Фоновые сервисы ---
builder.Services.AddHostedService<WeatherWorker>();
builder.Services.AddHostedService<TrafficWorker>();
builder.Services.AddHostedService<TelemetryWorker>();
builder.Services.AddHostedService<RetentionWorker>();

// --- SignalR, health ---
builder.Services.AddSignalR(/* см. 4.3 */);
builder.Services.AddHealthChecks().AddDbContextCheck<DeskHubDbContext>();
builder.Services.AddProblemDetails();
```

### 6.2. Время жизни сервисов

| Сервис | Lifetime | Комментарий |
|---|---|---|
| `DeskHubDbContext` | Scoped | В воркерах (singleton) — **только** через `IServiceScopeFactory.CreateAsyncScope()` на каждую итерацию |
| `OpenMeteoClient`, `ITrafficProvider` | Transient (typed HttpClient) | Внутри — пул `HttpMessageHandler` от `IHttpClientFactory` |
| `DashboardState`, `DashboardBroadcaster` | Singleton | Общий снимок для всех клиентов |
| `ITelemetryReader` | Singleton | Хранит предыдущий замер `/proc/stat` для расчёта загрузки CPU |
| `TimeProvider` | Singleton | Абстракция времени — для тестов воркеров |
| Воркеры | Singleton (`AddHostedService`) | Не держат Scoped-зависимостей в конструкторе |

> ⚠️ Классическая ошибка: внедрить `DbContext` в конструктор `BackgroundService`. Это захват scoped-сервиса в singleton — запрещено (и ловится `ValidateScopes` в Development).

---

## 7. Конфигурация

`appsettings.json` (значения по умолчанию) + переменные окружения из `docker-compose` (переопределяют, формат `Section__Key`).

```json
{
  "ConnectionStrings": { "DeskHub": "Host=db;Port=5432;Database=deskhub;Username=deskhub;Password=<из env>" },
  "Weather":   { "Latitude": 55.75, "Longitude": 37.62, "LocationName": "Москва", "IntervalMinutes": 15 },
  "Traffic":   { "Provider": "TomTom", "ApiKey": "<из env>", "IntervalMinutes": 5, "PeakIntervalMinutes": 2,
                 "PeakHours": ["07:00-10:00", "17:00-20:00"] },
  "Telemetry": { "IntervalSeconds": 1, "ProcRoot": "/proc", "SysRoot": "/sys" },
  "Retention": { "WeatherDays": 90, "TrafficDays": 180 },
  "Logging":   { "LogLevel": { "Default": "Information", "Microsoft.AspNetCore": "Warning" } }
}
```

- **Секреты** (пароль БД, ключ API карт) — только из переменных окружения / `.env`, не в git.
- Невалидная конфигурация роняет приложение при старте (`ValidateOnStart`), а не в рантайме.
- Таймзона бизнес-логики (часы пик, ночной режим) — `TZ` контейнера, совпадающая с хостом.

---

## 8. Логирование и наблюдаемость

- Встроенный `ILogger` с JSON-консолью (`AddJsonConsole`) → читается через `docker compose logs`.
- Ротация логов — на уровне Docker (`logging.options.max-size`), чтобы не забить SD-карту.
- Уровни: `Information` для событий жизненного цикла (старт воркера, подключение клиента), `Warning` для временных сбоев внешних API, `Error` для неожиданных исключений.
- Телеметрия **не логируется** на каждом тике.

---

## 9. Тестирование

- **Unit (xUnit):** маппинг Open-Meteo → `WeatherDto`, расчёт `CongestionLevel`, парсинг `/proc/stat`, `/proc/meminfo`, `/proc/uptime` по файлам-фикстурам.
- **Integration:** `WebApplicationFactory` + Testcontainers (PostgreSQL) — snapshot-эндпоинт, миграции, fallback на `index.html`, 404 для неизвестного `/api/*`.
- **SignalR:** тестовый `HubConnection` к `WebApplicationFactory` — проверка, что воркер с фейковым провайдером рассылает событие.
