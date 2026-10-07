using System.Globalization;
using System.Net.Http.Json;
using DeskHub.Api.Hubs;
using DeskHub.Api.Services.Weather;
using Microsoft.Extensions.Options;

namespace DeskHub.Api.Workers;

/// <summary>
/// Раз в OpenMeteo:IntervalMinutes запрашивает прогноз Open-Meteo и рассылает WeatherUpdated.
/// При ошибке не падает: повторяет запрос с нарастающей задержкой (1, 2, 4… мин, не дольше интервала),
/// а на экране остаются последние данные — фронтенд сам пометит их устаревшими по updatedAt.
/// </summary>
public sealed class WeatherWorker(
    IHttpClientFactory httpClientFactory,
    DashboardNotifier notifier,
    TimeProvider time,
    IOptions<OpenMeteoOptions> options,
    ILogger<WeatherWorker> logger) : BackgroundService
{
    private static readonly TimeSpan FirstRetryDelay = TimeSpan.FromMinutes(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var settings = options.Value;
        var interval = TimeSpan.FromMinutes(settings.IntervalMinutes);
        var failures = 0;

        logger.LogInformation("WeatherWorker started: {Location} ({Lat}, {Lon}), interval {Interval}",
            settings.LocationName, settings.Latitude, settings.Longitude, interval);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RefreshAsync(settings, stoppingToken);
                if (failures > 0) logger.LogInformation("Weather refresh recovered after {Failures} failures", failures);
                failures = 0;
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                // Сеть, таймаут, 5xx, неожиданный JSON — ждём и пробуем снова
                failures++;
                logger.LogWarning(ex, "Weather refresh failed (attempt {Failures})", failures);
            }

            var delay = failures == 0
                ? interval
                : TimeSpan.FromTicks(Math.Min(interval.Ticks, FirstRetryDelay.Ticks << Math.Min(failures - 1, 10)));

            try
            {
                await Task.Delay(delay, time, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task RefreshAsync(OpenMeteoOptions settings, CancellationToken ct)
    {
        var client = httpClientFactory.CreateClient(OpenMeteoOptions.HttpClientName);
        var response = await client.GetFromJsonAsync<OpenMeteoResponse>(BuildRequestUri(settings), ct)
            ?? throw new InvalidOperationException("Open-Meteo returned an empty body");

        var weather = OpenMeteoMapper.ToWeatherModel(response, settings.LocationName, time.GetUtcNow());
        await notifier.SendWeatherUpdate(weather, ct);

        logger.LogInformation("Weather updated: {Temperature} °C, {Description}, {Hours} hourly points",
            weather.Temperature, weather.Description, weather.Hourly.Count);
    }

    private const string Fields =
        "&current=temperature_2m,apparent_temperature,weather_code,precipitation,is_day,uv_index" +
        "&hourly=temperature_2m,weather_code,is_day,precipitation_probability" +
        "&timezone=auto&forecast_days=2";

    // InvariantCulture: в ru-RU дробный разделитель — запятая, API её не примет
    private static string BuildRequestUri(OpenMeteoOptions s) => string.Create(CultureInfo.InvariantCulture,
        $"v1/forecast?latitude={s.Latitude}&longitude={s.Longitude}{Fields}");
}
