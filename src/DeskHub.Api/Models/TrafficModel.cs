namespace DeskHub.Api.Models;

public enum CongestionLevel
{
    Free,
    Moderate,
    Heavy,
    Severe,
}

/// <summary>Время в пути по одному маршруту.</summary>
/// <param name="RouteName">Название маршрута («Дом → Работа»).</param>
/// <param name="DurationMinutes">Текущее время в пути с учётом пробок, мин.</param>
/// <param name="Congestion">Уровень загруженности.</param>
/// <param name="UpdatedAt">Когда бэкенд получил данные (UTC).</param>
public sealed record TrafficModel(
    string RouteName,
    int DurationMinutes,
    CongestionLevel Congestion,
    DateTimeOffset UpdatedAt);
