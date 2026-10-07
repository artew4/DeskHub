namespace DeskHub.Api.Models;

/// <summary>Тестовые данные пробок до появления TrafficWorker.</summary>
public static class StubData
{
    public static IReadOnlyList<TrafficModel> Traffic(DateTimeOffset now) =>
    [
        new TrafficModel("Дом → Работа", 32, CongestionLevel.Heavy, now),
        new TrafficModel("Работа → Дом", 25, CongestionLevel.Free, now),
    ];
}
