using System.Threading.Channels;
using Microsoft.Extensions.Options;

namespace DeskHub.Api.Services.Traffic;

/// <summary>
/// «Спящий режим» TrafficWorker: помнит, когда клиент в последний раз видел виджет пробок,
/// и умеет мгновенно разбудить воркер из хаба (канал на один сигнал — лишние сигналы схлопываются).
/// Singleton: пишут методы хаба, читает TrafficWorker.
/// </summary>
public sealed class TrafficActivityTracker(TimeProvider time, IOptions<TrafficOptions> options, ILogger<TrafficActivityTracker> logger)
{
    /// <summary>Без пингов видимости дольше этого — воркер засыпает (Traffic:IdleMinutes, по умолчанию 10).</summary>
    public TimeSpan IdleAfter { get; } = TimeSpan.FromMinutes(options.Value.IdleMinutes);
    /// <summary>ForceTrafficRefresh не чаще: защита Яндекса от спама (риск капчи/бана).</summary>
    public static readonly TimeSpan MinForcedInterval = TimeSpan.FromMinutes(1);

    private readonly Channel<string> _wake = Channel.CreateBounded<string>(
        new BoundedChannelOptions(1) { FullMode = BoundedChannelFullMode.DropWrite, SingleReader = true });

    // Ticks UTC — Interlocked/Volatile для потокобезопасности между хабом и воркером
    private long _lastActivityTicks = time.GetUtcNow().UtcTicks; // при старте считаем виджет «только что видели» — первый запрос сразу
    private long _lastFetchTicks;
    private volatile bool _sleeping;

    public DateTimeOffset LastTrafficActivity => new(Interlocked.Read(ref _lastActivityTicks), TimeSpan.Zero);
    public bool IsSleeping => _sleeping;

    /// <summary>Виджет пробок на экране — продлить «бодрствование»; спящий воркер будится сразу.</summary>
    public void ReportVisible()
    {
        Interlocked.Exchange(ref _lastActivityTicks, time.GetUtcNow().UtcTicks);
        if (_sleeping) Wake("traffic visible");
    }

    /// <summary>Клиенту нужны свежие данные сейчас (устарели). Учитывается как видимость; запрос — не чаще раза в минуту.</summary>
    public void RequestRefresh()
    {
        Interlocked.Exchange(ref _lastActivityTicks, time.GetUtcNow().UtcTicks);
        var sinceFetch = time.GetUtcNow() - new DateTimeOffset(Interlocked.Read(ref _lastFetchTicks), TimeSpan.Zero);
        if (sinceFetch < MinForcedInterval)
        {
            logger.LogDebug("ForceTrafficRefresh ignored: last fetch {Seconds:F0} s ago", sinceFetch.TotalSeconds);
            return;
        }
        Wake("forced refresh");
    }

    // ─── Для TrafficWorker ───────────────────────────────────────────────────

    public bool IsIdle(DateTimeOffset now) => now - LastTrafficActivity > IdleAfter;

    public void SetSleeping(bool sleeping) => _sleeping = sleeping;

    public void MarkFetched()
    {
        Interlocked.Exchange(ref _lastFetchTicks, time.GetUtcNow().UtcTicks);
        // Сигналы, пришедшие во время запроса, уже удовлетворены — не будить сразу ради повторного запроса
        while (_wake.Reader.TryRead(out _)) { }
    }

    /// <summary>
    /// Ждать timeout или сигнала пробуждения — что раньше. Возвращает причину пробуждения или null по таймауту.
    /// Заменяет Task.Delay в цикле воркера: сигнал из хаба прерывает и проверку во сне, и паузу между запросами.
    /// </summary>
    public async Task<string?> WaitAsync(TimeSpan timeout, CancellationToken ct)
    {
        using var timeoutCts = new CancellationTokenSource(timeout, time);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, timeoutCts.Token);
        try
        {
            return await _wake.Reader.ReadAsync(linked.Token);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            return null; // таймаут
        }
    }

    private void Wake(string reason) => _wake.Writer.TryWrite(reason);
}
