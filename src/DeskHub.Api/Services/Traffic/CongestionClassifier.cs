using DeskHub.Api.Models;

namespace DeskHub.Api.Services.Traffic;

/// <summary>
/// Уровень загруженности по отношению времени с пробками к времени по пустой дороге:
/// &lt; +20 % — Free, +20…50 % — Normal, +50…100 % — Heavy, ≥ +100 % — Severe.
/// </summary>
public static class CongestionClassifier
{
    public static CongestionLevel Classify(double durationMinutes, double freeFlowMinutes) =>
        (durationMinutes / freeFlowMinutes) switch
        {
            < 1.2 => CongestionLevel.Free,
            < 1.5 => CongestionLevel.Normal,
            < 2.0 => CongestionLevel.Heavy,
            _ => CongestionLevel.Severe,
        };
}
