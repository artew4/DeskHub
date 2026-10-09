using DeskHub.Api.Hubs;
using DeskHub.Api.Models;
using DeskHub.Api.Services.Calendar;
using DeskHub.Api.Services.Power;
using Microsoft.Extensions.Options;

namespace DeskHub.Api.Workers;

/// <summary>
/// Раз в Calendar:IntervalMinutes (15) скачивает все календари из Calendar:Sources (iCloud, Outlook, …) параллельно,
/// разворачивает события на сегодня и ближайшие дни, красит их в цвет календаря, сливает в один список
/// и рассылает CalendarUpdated.
///
/// Сбой одного календаря не мешает остальным: для него берутся события из последней успешной загрузки
/// (не старше <see cref="CacheMaxAge"/>), чтобы его события не «мигали» при временной ошибке сети.
/// </summary>
public sealed class CalendarWorker(
    IHttpClientFactory httpClientFactory,
    DashboardNotifier notifier,
    TimeProvider time,
    IOptions<CalendarOptions> options,
    PowerModeService power,
    ILogger<CalendarWorker> logger) : BackgroundService
{
    private static readonly TimeSpan RetryDelay = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan CacheMaxAge = TimeSpan.FromHours(6);
    /// <summary>Как часто спящий (режим питания Sleep) воркер проверяет, не наступило ли утро.</summary>
    private static readonly TimeSpan SleepCheck = TimeSpan.FromMinutes(1);

    /// <summary>Последний успешный результат по каждому источнику (индекс в Sources).</summary>
    private readonly Dictionary<int, (DateTimeOffset LoadedAt, List<CalendarEventModel> Events)> _lastGood = [];

    private sealed record Source(int Index, Uri Url, string Color)
    {
        /// <summary>Для логов: номер и хост — без секретной части ссылки.</summary>
        public override string ToString() => $"#{Index} {Url.Host}";
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var settings = options.Value;
        var sources = settings.EffectiveSources()
            .Select((s, i) => new Source(i, ToHttps(s.Url), s.Color.ToUpperInvariant()))
            .ToList();

        if (sources.Count == 0)
        {
            logger.LogWarning("Calendar:Sources is empty — calendar disabled");
            return;
        }

        var tz = TimeZoneInfo.FindSystemTimeZoneById(settings.TimeZone);
        var interval = TimeSpan.FromMinutes(settings.IntervalMinutes);
        logger.LogInformation("CalendarWorker started: {Count} sources ({Sources}), every {Interval}, tz {TimeZone}",
            sources.Count, string.Join(", ", sources), interval, tz.Id);

        var skipping = false;
        while (!stoppingToken.IsCancellationRequested)
        {
            // Режим питания Sleep (01:30–08:00): календари не скачиваем — кроме первой загрузки после старта
            if (_lastGood.Count > 0 && power.IsSleeping)
            {
                if (!skipping) logger.LogInformation("CalendarWorker: power mode Sleep — skipping updates");
                skipping = true;
                try { await Task.Delay(SleepCheck, time, stoppingToken); } catch (OperationCanceledException) { break; }
                continue;
            }
            if (skipping) logger.LogInformation("CalendarWorker: power mode {Mode} — resuming", power.Current);
            skipping = false;

            var allFresh = await RefreshAsync(sources, settings, tz, stoppingToken);

            try { await Task.Delay(allFresh ? interval : RetryDelay, time, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    /// <returns>true — все календари загрузились; false — был сбой, следующая попытка раньше.</returns>
    private async Task<bool> RefreshAsync(List<Source> sources, CalendarOptions settings, TimeZoneInfo tz, CancellationToken ct)
    {
        var now = time.GetUtcNow();
        var range = CalendarRange.For(now, tz, settings.DaysAhead);

        // Все источники — одновременно; каждый со своей обработкой ошибок
        var results = await Task.WhenAll(sources.Select(source => LoadAsync(source, range, ct)));
        if (ct.IsCancellationRequested) return true;

        var perSource = new List<List<CalendarEventModel>>();
        var failed = 0;
        foreach (var (source, events) in sources.Zip(results))
        {
            if (events is not null)
            {
                _lastGood[source.Index] = (now, events);
                perSource.Add(events);
            }
            else
            {
                failed++;
                if (_lastGood.TryGetValue(source.Index, out var cached) && now - cached.LoadedAt < CacheMaxAge)
                {
                    // Отрезаем закончившиеся до начала диапазона (кэш мог пережить полночь)
                    perSource.Add(cached.Events.Where(e => e.EndTime > range.Start).ToList());
                }
            }
        }

        if (failed == sources.Count && perSource.Count == 0)
        {
            logger.LogWarning("All {Count} calendars failed, nothing cached — keeping previous data", sources.Count);
            return false;
        }

        var calendar = new CalendarModel(IcsCalendarParser.Merge(perSource), range.Start, range.End, now);
        await notifier.SendCalendarUpdate(calendar, ct);
        logger.LogInformation("Calendar updated: {Events} events from {Ok}/{Total} calendars{Cached}",
            calendar.Events.Count, sources.Count - failed, sources.Count, failed > 0 ? " (rest from cache)" : "");
        return failed == 0;
    }

    /// <returns>События календаря или null при ошибке (уже залогирована).</returns>
    private async Task<List<CalendarEventModel>?> LoadAsync(Source source, CalendarRange range, CancellationToken ct)
    {
        try
        {
            var client = httpClientFactory.CreateClient(CalendarOptions.HttpClientName);
            await using var stream = await client.GetStreamAsync(source.Url, ct);
            var events = IcsCalendarParser.Parse(stream, range, source.Color);
            logger.LogDebug("Calendar {Source}: {Count} events", source, events.Count);
            return events;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            return null;
        }
        catch (Exception ex)
        {
            // HttpRequestException содержит URL в сообщении не всегда, но тип и статус — достаточно для диагностики
            logger.LogWarning("Calendar {Source} failed: {Error}: {Message}", source, ex.GetType().Name, Redact(ex.Message, source.Url));
            return null;
        }
    }

    /// <summary>Убирает секретную часть ссылки из текста ошибки.</summary>
    private static string Redact(string message, Uri url) => message.Replace(url.ToString(), url.Host + "/…");

    /// <summary>webcal:// — та же ссылка по HTTPS (iCloud отдаёт text/calendar).</summary>
    internal static Uri ToHttps(string url) =>
        new(url.StartsWith("webcal://", StringComparison.OrdinalIgnoreCase) ? "https://" + url["webcal://".Length..] : url);
}
