using DeskHub.Api.Hubs;
using DeskHub.Api.Services.Telemetry;
using Microsoft.Extensions.Options;

namespace DeskHub.Api.Workers;

/// <summary>
/// Раз в Telemetry:IntervalSeconds снимает метрики и рассылает TelemetryTick.
/// В БД ничего не пишет (см. knowledge/Backend_dotnet/Background_Workers.md, раздел 5).
/// </summary>
public sealed class TelemetryWorker(
    ITelemetryReader reader,
    DashboardNotifier notifier,
    TimeProvider time,
    IOptions<TelemetryOptions> options,
    ILogger<TelemetryWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromSeconds(options.Value.IntervalSeconds);
        logger.LogInformation("TelemetryWorker started: {Reader}, interval {Interval}", reader.GetType().Name, interval);

        // Прогревочный замер: первая загрузка CPU считается только по разнице двух чтений /proc/stat
        TryRead();

        using var timer = new PeriodicTimer(interval, time);
        var failing = false;

        while (await WaitForNextTickAsync(timer, stoppingToken))
        {
            try
            {
                await notifier.SendTelemetryUpdate(reader.Read(time.GetUtcNow()), stoppingToken);
                if (failing)
                {
                    failing = false;
                    logger.LogInformation("Telemetry collection recovered");
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex) when (!failing)
            {
                // Логируем только первый сбой серии, чтобы не писать ошибку каждую секунду.
                // Исключение не должно уйти из ExecuteAsync — иначе остановится весь хост.
                failing = true;
                logger.LogError(ex, "Telemetry collection failed");
            }
            catch
            {
                // Сбой продолжается — уже залогирован
            }
        }
    }

    private void TryRead()
    {
        try { reader.Read(time.GetUtcNow()); }
        catch (Exception ex) { logger.LogWarning(ex, "Initial telemetry read failed"); }
    }

    private static async Task<bool> WaitForNextTickAsync(PeriodicTimer timer, CancellationToken ct)
    {
        try { return await timer.WaitForNextTickAsync(ct); }
        catch (OperationCanceledException) { return false; }
    }
}
