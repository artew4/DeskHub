using DeskHub.Api.Hubs;
using DeskHub.Api.Models;
using DeskHub.Api.Services.Traffic;
using Microsoft.Extensions.Options;

namespace DeskHub.Api.Workers;

/// <summary>
/// Запрашивает время в пути по вариантам маршрута и рассылает TrafficUpdated.
/// Первая итерация — сразу при старте. Интервал между запросами — Traffic:IntervalMinutes
/// со случайным отклонением (jitter): запросы с идеально ровным шагом легко опознаются анти-ботом.
/// </summary>
public sealed class TrafficWorker(
    ITrafficProvider provider,
    DashboardNotifier notifier,
    TimeProvider time,
    IOptions<TrafficOptions> options,
    ILogger<TrafficWorker> logger) : BackgroundService
{
    // Отклонение от базового интервала: при 5 мин задержка 4–7 мин
    private const int JitterMinSeconds = -60;
    private const int JitterMaxSeconds = 120;
    private static readonly TimeSpan MinDelay = TimeSpan.FromMinutes(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var settings = options.Value;
        var baseInterval = TimeSpan.FromMinutes(settings.IntervalMinutes);
        logger.LogInformation("TrafficWorker started: {Provider}, interval {Interval} {Min:+0;-0}…{Max:+0;-0} s",
            provider.GetType().Name, baseInterval, JitterMinSeconds, JitterMaxSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var routes = await provider.GetRoutesAsync(stoppingToken);
                var traffic = new TrafficModel(
                    settings.OriginName, settings.OriginAddress,
                    settings.DestinationName, settings.DestinationAddress,
                    routes, time.GetUtcNow());

                await notifier.SendTrafficUpdate(traffic, stoppingToken);
                logger.LogInformation("Traffic updated: {Routes}",
                    string.Join(", ", routes.Select(r => $"{r.Id} {r.DurationMinutes} min ({r.Congestion})")));
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                // Не роняем хост: на экране остаются последние данные, фронтенд пометит их устаревшими
                logger.LogWarning(ex, "Traffic refresh failed");
            }

            var delay = NextDelay(baseInterval);
            logger.LogInformation("Next traffic refresh in {Seconds} s", (int)delay.TotalSeconds);

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

    /// <summary>Базовый интервал + случайные [JitterMinSeconds; JitterMaxSeconds] секунд, не меньше минуты.</summary>
    private static TimeSpan NextDelay(TimeSpan baseInterval)
    {
        var jitter = TimeSpan.FromSeconds(Random.Shared.Next(JitterMinSeconds, JitterMaxSeconds + 1));
        var delay = baseInterval + jitter;
        return delay < MinDelay ? MinDelay : delay;
    }
}
