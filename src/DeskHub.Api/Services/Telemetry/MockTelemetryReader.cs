using DeskHub.Api.Models;

namespace DeskHub.Api.Services.Telemetry;

/// <summary>
/// Правдоподобные метрики для разработки на macOS/Windows: плавное случайное блуждание,
/// чтобы графики и цветовые пороги выглядели как на реальном устройстве.
/// </summary>
public sealed class MockTelemetryReader : ITelemetryReader
{
    private const int RamTotalMb = 8064; // Raspberry Pi 5, 8 GB

    private double _cpu = 15;
    private double _ramUsedMb = 2200;

    public TelemetryModel Read(DateTimeOffset now)
    {
        var random = Random.Shared;

        // Фон 5–35 %, изредка короткие пики нагрузки
        _cpu = Math.Clamp(_cpu + (random.NextDouble() - 0.5) * 8, 5, 35);
        var cpu = random.NextDouble() < 0.05 ? random.Next(60, 95) : _cpu;

        _ramUsedMb = Math.Clamp(_ramUsedMb + (random.NextDouble() - 0.5) * 40, 1800, 2800);

        // Температура 45–55 °C, растёт вместе с загрузкой
        var temperature = 45 + cpu / 100 * 10 + (random.NextDouble() - 0.5);

        return new TelemetryModel(
            CpuPercent: Math.Round(cpu, 1),
            RamUsedMb: (int)_ramUsedMb,
            RamTotalMb: RamTotalMb,
            TemperatureC: Math.Round(Math.Clamp(temperature, 45, 55), 1),
            UptimeSeconds: Environment.TickCount64 / 1000,
            Timestamp: now);
    }
}
