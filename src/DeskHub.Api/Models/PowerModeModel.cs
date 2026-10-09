namespace DeskHub.Api.Models;

/// <summary>Режим питания экрана по времени суток.</summary>
public enum PowerMode
{
    /// <summary>08:00–00:00 — обычная работа.</summary>
    Normal,
    /// <summary>00:00–01:30 — экран затемнён на 50 %; также — временное пробуждение ночью.</summary>
    Dimmed,
    /// <summary>01:30–08:00 — экран чёрный, воркеры погоды/пробок/календаря не ходят в сеть.</summary>
    Sleep,
}

/// <summary>Состояние питания для клиента (событие PowerModeChanged).</summary>
/// <param name="Mode">Текущий режим.</param>
/// <param name="WakeUntil">До какого момента длится временное пробуждение (WakeScreen ночью); иначе null.</param>
/// <param name="ChangedAt">Когда режим сменился (UTC).</param>
public sealed record PowerModeModel(PowerMode Mode, DateTimeOffset? WakeUntil, DateTimeOffset ChangedAt);
