namespace DeskHub.Api.Models;

/// <summary>Метрики Raspberry Pi на момент замера.</summary>
/// <param name="CpuPercent">Загрузка CPU, 0–100.</param>
/// <param name="RamUsedMb">Использовано RAM, МБ.</param>
/// <param name="RamTotalMb">Всего RAM, МБ.</param>
/// <param name="TemperatureC">Температура SoC, °C.</param>
/// <param name="Timestamp">Время замера (UTC).</param>
public sealed record TelemetryModel(
    double CpuPercent,
    int RamUsedMb,
    int RamTotalMb,
    double TemperatureC,
    DateTimeOffset Timestamp);
