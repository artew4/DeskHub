using DeskHub.Api.Hubs;
using DeskHub.Api.Models;
using Microsoft.Extensions.Options;

namespace DeskHub.Api.Services.Power;

/// <summary>
/// Менеджер питания: режим экрана по расписанию (МСК) + временное пробуждение.
///
/// - <see cref="Current"/> вычисляется на лету из часов и <c>_wakeUntil</c> — воркеры спрашивают <see cref="IsSleeping"/>
///   и всегда получают точный ответ без собственной логики времени.
/// - Для уведомления клиентов (PowerModeChanged) один таймер TimeProvider взводится ровно на ближайшую смену режима:
///   границу расписания (00:00, 01:30, 08:00) или конец временного пробуждения. Без опроса.
/// - WakeScreen() в режиме Sleep: <c>_wakeUntil = now + 5 мин</c> → Dimmed сразу; таймер срабатывает в <c>_wakeUntil</c> → снова Sleep.
/// - SetSleepMode() (кнопка «В режим сна»): принудительный Sleep в любое время — <c>_forcedSleepUntil</c> = ближайшее утро
///   (NormalFrom), временное пробуждение сбрасывается. Снимается касанием (WakeScreen) или утром по таймеру.
/// </summary>
public sealed class PowerModeService(
    TimeProvider time,
    IOptions<PowerOptions> options,
    DashboardState state,
    DashboardNotifier notifier,
    ILogger<PowerModeService> logger) : IHostedService, IDisposable
{
    private readonly PowerOptions _settings = options.Value;
    private readonly TimeZoneInfo _tz = TimeZoneInfo.FindSystemTimeZoneById(options.Value.TimeZone);
    private readonly Lock _lock = new();
    private ITimer? _timer;
    private DateTimeOffset? _wakeUntil;
    private DateTimeOffset? _forcedSleepUntil;
    private PowerMode? _published;

    public PowerMode Current
    {
        get { lock (_lock) return Compute(time.GetUtcNow()); }
    }
    public bool IsSleeping => Current == PowerMode.Sleep;

    /// <summary>Режим по расписанию для момента now (без учёта временного пробуждения).</summary>
    public PowerMode Scheduled(DateTimeOffset now)
    {
        var t = TimeZoneInfo.ConvertTime(now, _tz).TimeOfDay;
        if (InRange(t, _settings.SleepFrom, _settings.NormalFrom)) return PowerMode.Sleep;
        if (InRange(t, _settings.DimFrom, _settings.SleepFrom)) return PowerMode.Dimmed;
        return PowerMode.Normal;
    }

    /// <summary>
    /// Временное пробуждение (метод хаба WakeScreen). Принудительный сон снимается полностью — дальше режим по расписанию;
    /// в ночном Sleep по расписанию экран включается затемнённым на WakeMinutes минут.
    /// </summary>
    public PowerModeModel WakeTemporarily()
    {
        lock (_lock)
        {
            var now = time.GetUtcNow();
            if (_forcedSleepUntil > now)
            {
                _forcedSleepUntil = null;
                logger.LogInformation("Manual sleep cancelled by touch");
            }
            if (Scheduled(now) == PowerMode.Sleep && !(_wakeUntil > now))
            {
                _wakeUntil = now.AddMinutes(_settings.WakeMinutes);
                logger.LogInformation("Screen woken until {Until:HH:mm:ss} UTC", _wakeUntil);
            }
            return PublishAndRearm(now);
        }
    }

    /// <summary>
    /// Принудительный сон (метод хаба SetSleepMode): Sleep сразу, до касания или до утра (NormalFrom).
    /// Активное временное пробуждение сбрасывается; клиентам уходит PowerModeChanged.
    /// </summary>
    public PowerModeModel SleepNow()
    {
        lock (_lock)
        {
            var now = time.GetUtcNow();
            _wakeUntil = null;
            _forcedSleepUntil = NextOccurrence(now, _settings.NormalFrom);
            logger.LogInformation("Manual sleep until {Until:yyyy-MM-dd HH:mm zzz} (or next touch)", _forcedSleepUntil);
            return PublishAndRearm(now);
        }
    }

    public Task StartAsync(CancellationToken ct)
    {
        _timer = time.CreateTimer(_ => OnTimer(), null, Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
        lock (_lock) PublishAndRearm(time.GetUtcNow());
        logger.LogInformation("PowerModeService started: {Mode} (Dimmed {Dim}, Sleep {Sleep}, Normal {Normal}, tz {Tz})",
            Current, _settings.DimFrom, _settings.SleepFrom, _settings.NormalFrom, _tz.Id);
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken ct)
    {
        _timer?.Change(Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
        return Task.CompletedTask;
    }

    public void Dispose() => _timer?.Dispose();

    private void OnTimer()
    {
        lock (_lock) PublishAndRearm(time.GetUtcNow());
    }

    private PowerMode Compute(DateTimeOffset now)
    {
        if (_forcedSleepUntil > now) return PowerMode.Sleep;
        var scheduled = Scheduled(now);
        return scheduled == PowerMode.Sleep && _wakeUntil > now ? PowerMode.Dimmed : scheduled;
    }

    /// <summary>Обновить DashboardState, разослать при смене режима, взвести таймер на следующую смену. Под _lock.</summary>
    private PowerModeModel PublishAndRearm(DateTimeOffset now)
    {
        if (_wakeUntil <= now) _wakeUntil = null; // пробуждение закончилось
        if (_forcedSleepUntil <= now) _forcedSleepUntil = null; // наступило утро — принудительный сон снят
        var mode = Compute(now);
        var model = new PowerModeModel(mode, mode == PowerMode.Dimmed && Scheduled(now) == PowerMode.Sleep ? _wakeUntil : null, now);

        if (_published != mode)
        {
            _published = mode;
            state.SetPowerMode(model);
            logger.LogInformation("Power mode → {Mode}", mode);
            _ = notifier.SendPowerModeUpdate(model).ContinueWith(
                t => logger.LogWarning(t.Exception, "PowerModeChanged broadcast failed"), TaskContinuationOptions.OnlyOnFaulted);
        }

        var next = NextChange(now) - now;
        _timer?.Change(next < TimeSpan.FromMilliseconds(50) ? TimeSpan.FromMilliseconds(50) : next, Timeout.InfiniteTimeSpan);
        return model;
    }

    /// <summary>Ближайший момент, когда режим может смениться: граница расписания или конец пробуждения.</summary>
    private DateTimeOffset NextChange(DateTimeOffset now)
    {
        var candidates = new[] { _settings.DimFrom, _settings.SleepFrom, _settings.NormalFrom }
            .Select(b => NextOccurrence(now, b))
            .ToList();
        if (_wakeUntil is { } until && until > now) candidates.Add(until);
        if (_forcedSleepUntil is { } forced && forced > now) candidates.Add(forced);
        return candidates.Min();
    }

    /// <summary>Ближайшее (строго после now) наступление времени суток b по часовому поясу расписания.</summary>
    private DateTimeOffset NextOccurrence(DateTimeOffset now, TimeSpan b)
    {
        var local = TimeZoneInfo.ConvertTime(now, _tz);
        var wall = local.Date + b;
        if (wall <= local.DateTime) wall = wall.AddDays(1);
        return new DateTimeOffset(wall, _tz.GetUtcOffset(wall));
    }

    /// <summary>t ∈ [from; to) с учётом перехода через полночь.</summary>
    private static bool InRange(TimeSpan t, TimeSpan from, TimeSpan to) =>
        from <= to ? t >= from && t < to : t >= from || t < to;
}
