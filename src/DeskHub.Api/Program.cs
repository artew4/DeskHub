using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using DeskHub.Api.Hubs;
using DeskHub.Api.Services;
using DeskHub.Api.Services.Calendar;
using DeskHub.Api.Services.Telemetry;
using DeskHub.Api.Services.Traffic;
using DeskHub.Api.Services.Weather;
using DeskHub.Api.Workers;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

// Единые правила JSON для REST и SignalR: camelCase, enum строками ("heavy")
var enumConverter = new JsonStringEnumConverter(JsonNamingPolicy.CamelCase);
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(enumConverter));

builder.Services.AddOpenApi();
builder.Services.AddHealthChecks();
builder.Services
    .AddSignalR(o =>
    {
        // Согласовано с клиентом (withKeepAliveInterval / withServerTimeout)
        o.KeepAliveInterval = TimeSpan.FromSeconds(10);
        o.ClientTimeoutInterval = TimeSpan.FromSeconds(30);
        o.EnableDetailedErrors = builder.Environment.IsDevelopment();
    })
    .AddJsonProtocol(o => o.PayloadSerializerOptions.Converters.Add(enumConverter));

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<DashboardState>();
builder.Services.AddSingleton<DashboardNotifier>();

// --- Телеметрия: реальные метрики на Linux (Raspberry Pi), мок на macOS/Windows ---
builder.Services.AddOptions<TelemetryOptions>()
    .BindConfiguration(TelemetryOptions.SectionName)
    .ValidateDataAnnotations()
    .ValidateOnStart();
if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
    builder.Services.AddSingleton<ITelemetryReader, LinuxTelemetryReader>();
else
    builder.Services.AddSingleton<ITelemetryReader, MockTelemetryReader>();

builder.Services.AddHostedService<TelemetryWorker>();

// --- Погода: Open-Meteo (без ключа) ---
builder.Services.AddOptions<OpenMeteoOptions>()
    .BindConfiguration(OpenMeteoOptions.SectionName)
    .ValidateDataAnnotations()
    .ValidateOnStart();
builder.Services.AddHttpClient(OpenMeteoOptions.HttpClientName, (sp, client) =>
{
    client.BaseAddress = new Uri(sp.GetRequiredService<IOptions<OpenMeteoOptions>>().Value.BaseUrl);
    client.Timeout = TimeSpan.FromSeconds(20);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("DeskHub/1.0");
});
builder.Services.AddHostedService<WeatherWorker>();

// --- Пробки: веб-версия Яндекс Карт (ТТК vs МКАД); Traffic:Provider=Mock — генератор для разработки ---
builder.Services.AddOptions<TrafficOptions>()
    .BindConfiguration(TrafficOptions.SectionName)
    .ValidateDataAnnotations()
    .ValidateOnStart();
builder.Services.AddHttpClient(TrafficOptions.YandexHttpClientName, (sp, client) =>
    {
        client.BaseAddress = new Uri(sp.GetRequiredService<IOptions<TrafficOptions>>().Value.YandexBaseUrl);
        client.Timeout = TimeSpan.FromSeconds(30);
        // Заголовки обычного Chrome: без них Яндекс отдаёт капчу или пустую страницу
        client.DefaultRequestHeaders.UserAgent.ParseAdd(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36");
        client.DefaultRequestHeaders.Accept.ParseAdd("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
        client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("ru-RU,ru;q=0.9,en;q=0.8");
    })
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
    {
        AutomaticDecompression = System.Net.DecompressionMethods.All,
        AllowAutoRedirect = true,
    });
if (builder.Configuration[$"{TrafficOptions.SectionName}:Provider"] == "Mock")
    builder.Services.AddSingleton<ITrafficProvider, MockTrafficProvider>();
else
    builder.Services.AddSingleton<ITrafficProvider, YandexHtmlTrafficProvider>();
builder.Services.AddHostedService<TrafficWorker>();

// --- Календарь: публичная ссылка iCloud (.ics) ---
builder.Services.AddOptions<CalendarOptions>()
    .BindConfiguration(CalendarOptions.SectionName)
    .ValidateDataAnnotations()
    .ValidateOnStart();
builder.Services.AddHttpClient(CalendarOptions.HttpClientName, client =>
    {
        client.Timeout = TimeSpan.FromSeconds(30);
        client.DefaultRequestHeaders.UserAgent.ParseAdd("DeskHub/1.0");
    })
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AutomaticDecompression = System.Net.DecompressionMethods.All });
builder.Services.AddHostedService<AppleCalendarWorker>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// React-билд из wwwroot (см. knowledge/Backend_dotnet/Core_Architecture.md, раздел 3)
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
        ctx.Context.Response.Headers.CacheControl = ctx.Context.Request.Path.StartsWithSegments("/assets")
            ? "public, max-age=31536000, immutable"
            : "no-cache",
});

app.MapHealthChecks("/health");

app.MapGet("/api/dashboard/snapshot", (DashboardState state) => state.GetSnapshot())
    .WithName("GetDashboardSnapshot");

app.MapHub<DashboardHub>("/hubs/dashboard");

// Неизвестные /api/* и /hubs/* — 404, а не index.html
app.Map("/api/{**path}", () => Results.NotFound());
app.Map("/hubs/{**path}", () => Results.NotFound());

// SPA fallback — всегда последним
app.MapFallbackToFile("index.html", new StaticFileOptions
{
    OnPrepareResponse = ctx => ctx.Context.Response.Headers.CacheControl = "no-cache",
});

app.Run();
