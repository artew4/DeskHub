using DeskHub.Api.Hubs;
using DeskHub.Api.Models;
using DeskHub.Api.Services.Traffic;
using Microsoft.Extensions.Options;

namespace DeskHub.Api.Workers;

/// <summary>
/// Запрашивает время в пути по вариантам маршрута и рассылает TrafficUpdated.
/// Первая итерация — сразу при старте. Интервал между запросами — Traffic:IntervalMinutes
/// со случайным отклонением (jitter): запросы с идеально ровным шагом легко опознаются анти-ботом.
///
/// «Спящий режим»: если клиент не сообщал о видимости виджета пробок дольше 10 минут
/// (<see cref="TrafficActivityTracker"/>), воркер не ходит в Яндекс и раз в 30 с проверяет, не пора ли проснуться.
/// Пробуждение мгновенное: вызов хаба (ReportTrafficVisible / ForceTrafficRefresh) пишет сигнал в канал,
/// и ожидание — и во сне, и в паузе между запросами — прерывается сразу.
/// </summary>
public sealed class TrafficWorker(
    ITrafficProvider provider,
    DashboardNotifier notifier,
    TrafficActivityTracker activity,
    TimeProvider time,
    IOptions<TrafficOptions> options,
    ILogger<TrafficWorker> logger) : BackgroundService
{
    // Отклонение от базового интервала: при 5 мин задержка 4–7 мин
    private const int JitterMinSeconds = -60;
    private const int JitterMaxSeconds = 120;
    private static readonly TimeSpan MinDelay = TimeSpan.FromMinutes(1);
    /// <summary>Как часто спящий воркер проверяет время последней активности (помимо мгновенного сигнала).</summary>
    private static readonly TimeSpan SleepCheck = TimeSpan.FromSeconds(30);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var settings = options.Value;
        var baseInterval = TimeSpan.FromMinutes(settings.IntervalMinutes);
        logger.LogInformation("TrafficWorker started: {Provider}, interval {Interval} {Min:+0;-0}…{Max:+0;-0} s",
            provider.GetType().Name, baseInterval, JitterMinSeconds, JitterMaxSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            // ─── Спящий режим ───
            if (activity.IsIdle(time.GetUtcNow()))
            {
                if (!activity.IsSleeping)
                {
                    activity.SetSleeping(true);
                    logger.LogInformation("TrafficWorker is sleeping... (traffic widget not visible for {Minutes} min)",
                        activity.IdleAfter.TotalMinutes);
                }
                try { await activity.WaitAsync(SleepCheck, stoppingToken); }
                catch (OperationCanceledException) { break; }
                continue; // проснулись по сигналу или по 30-секундной проверке — переоценить
            }
            if (activity.IsSleeping)
            {
                activity.SetSleeping(false);
                logger.LogInformation("TrafficWorker woke up — fetching now");
            }

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
            activity.MarkFetched();

            var delay = NextDelay(baseInterval);
            logger.LogInformation("Next traffic refresh in {Seconds} s", (int)delay.TotalSeconds);

            try
            {
                // Пауза прерывается сигналом ForceTrafficRefresh
                var reason = await activity.WaitAsync(delay, stoppingToken);
                if (reason is not null) logger.LogInformation("Traffic refresh requested early: {Reason}", reason);
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
