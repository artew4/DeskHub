using DeskHub.Api.Hubs;
using DeskHub.Api.Services.Calendar;
using Microsoft.Extensions.Options;

namespace DeskHub.Api.Workers;

/// <summary>
/// Раз в Calendar:IntervalMinutes (15) скачивает .ics по публичной ссылке iCloud, разворачивает события
/// на сегодня и ближайшие дни и рассылает CalendarUpdated. Пустой Calendar:WebcalUrl — воркер не работает,
/// фронтенд показывает «Календарь не подключён». Ошибка — повтор через 2 мин, на экране остаются прежние данные.
/// </summary>
public sealed class AppleCalendarWorker(
    IHttpClientFactory httpClientFactory,
    DashboardNotifier notifier,
    TimeProvider time,
    IOptions<CalendarOptions> options,
    ILogger<AppleCalendarWorker> logger) : BackgroundService
{
    private static readonly TimeSpan RetryDelay = TimeSpan.FromMinutes(2);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var settings = options.Value;
        if (string.IsNullOrWhiteSpace(settings.WebcalUrl))
        {
            logger.LogWarning("Calendar:WebcalUrl is not set — calendar disabled");
            return;
        }

        var url = ToHttps(settings.WebcalUrl);
        var tz = TimeZoneInfo.FindSystemTimeZoneById(settings.TimeZone);
        var interval = TimeSpan.FromMinutes(settings.IntervalMinutes);
        // Ссылка содержит секретный токен — в лог только хост
        logger.LogInformation("AppleCalendarWorker started: {Host}, every {Interval}, tz {TimeZone}", url.Host, interval, tz.Id);

        while (!stoppingToken.IsCancellationRequested)
        {
            var delay = interval;
            try
            {
                var client = httpClientFactory.CreateClient(CalendarOptions.HttpClientName);
                await using var stream = await client.GetStreamAsync(url, stoppingToken);
                var calendar = IcsCalendarParser.Parse(stream, time.GetUtcNow(), tz, settings.DaysAhead);

                await notifier.SendCalendarUpdate(calendar, stoppingToken);
                logger.LogInformation("Calendar updated: {Count} events {From:dd.MM}–{To:dd.MM}",
                    calendar.Events.Count, calendar.RangeStart, calendar.RangeEnd.AddDays(-1));
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Calendar refresh failed ({Host})", url.Host);
                delay = RetryDelay;
            }

            try { await Task.Delay(delay, time, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    /// <summary>webcal:// — та же ссылка по HTTPS (iCloud отдаёт text/calendar).</summary>
    internal static Uri ToHttps(string url) =>
        new(url.StartsWith("webcal://", StringComparison.OrdinalIgnoreCase) ? "https://" + url["webcal://".Length..] : url);
}
