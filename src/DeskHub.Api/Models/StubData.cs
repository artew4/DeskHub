namespace DeskHub.Api.Models;

/// <summary>Тестовые данные до появления фоновых воркеров.</summary>
public static class StubData
{
    public static DashboardSnapshot CreateSnapshot(DateTimeOffset now) => new(
        Weather: new WeatherModel(12.4, "Облачно", "cloud", now),
        Traffic:
        [
            new TrafficModel("Дом → Работа", 32, CongestionLevel.Heavy, now),
            new TrafficModel("Работа → Дом", 25, CongestionLevel.Free, now),
        ],
        Telemetry: new TelemetryModel(23.5, 2150, 8064, 54.2, now),
        ServerTime: now);
}
