using System.Net.Http.Json;
using DeskHub.Api.Hubs;
using DeskHub.Api.Services.Weather;
using Microsoft.Extensions.Options;

namespace DeskHub.Api.Workers;

/// <summary>
/// Раз в Weather:IntervalMinutes запрашивает погоду с wttr.in (https://wttr.in/Moscow?format=j1&amp;lang=ru)
/// и рассылает WeatherUpdated в прежнем формате WeatherModel.
/// При ошибке не падает: повторяет запрос с нарастающей задержкой (1, 2, 4… мин, не дольше интервала),
/// а на экране остаются последние данные — фронтенд сам пометит их устаревшими по updatedAt.
/// </summary>
public sealed class WeatherWorker(
    IHttpClientFactory httpClientFactory,
    DashboardNotifier notifier,
    TimeProvider time,
    IOptions<WeatherOptions> options,
    ILogger<WeatherWorker> logger) : BackgroundService
{
    private static readonly TimeSpan FirstRetryDelay = TimeSpan.FromMinutes(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var settings = options.Value;
        var interval = TimeSpan.FromMinutes(settings.IntervalMinutes);
        var tz = TimeZoneInfo.FindSystemTimeZoneById(settings.TimeZone);
        var failures = 0;

        logger.LogInformation("WeatherWorker started: wttr.in/{City} ({Location}, tz {TimeZone}), interval {Interval}",
            settings.City, settings.LocationName, tz.Id, interval);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RefreshAsync(settings, tz, stoppingToken);
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

    private async Task RefreshAsync(WeatherOptions settings, TimeZoneInfo tz, CancellationToken ct)
    {
        var client = httpClientFactory.CreateClient(WeatherOptions.HttpClientName);
        var response = await client.GetFromJsonAsync<WttrResponse>(BuildRequestUri(settings), WttrResponse.JsonOptions, ct)
            ?? throw new InvalidOperationException("wttr.in returned an empty body");

        var weather = WttrMapper.ToWeatherModel(response, settings.LocationName, time.GetUtcNow(), tz);
        await notifier.SendWeatherUpdate(weather, ct);

        logger.LogInformation("Weather updated: {Temperature} °C, {Description} ({Icon}), {Hours} forecast points",
            weather.Temperature, weather.Description, weather.Icon, weather.Hourly.Count);
    }

    /// <summary>«Moscow?format=j1&amp;lang=ru» — JSON с русскими описаниями (lang_ru).</summary>
    private static string BuildRequestUri(WeatherOptions s) => $"{Uri.EscapeDataString(s.City)}?format=j1&lang=ru";
}
