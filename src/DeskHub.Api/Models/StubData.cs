namespace DeskHub.Api.Models;

/// <summary>Тестовые данные погоды и пробок до появления WeatherWorker / TrafficWorker.</summary>
public static class StubData
{
    public static WeatherModel Weather(DateTimeOffset now) => new(12.4, "Облачно", "cloud", now);

    public static IReadOnlyList<TrafficModel> Traffic(DateTimeOffset now) =>
    [
        new TrafficModel("Дом → Работа", 32, CongestionLevel.Heavy, now),
        new TrafficModel("Работа → Дом", 25, CongestionLevel.Free, now),
    ];
}
