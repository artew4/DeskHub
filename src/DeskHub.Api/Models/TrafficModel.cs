namespace DeskHub.Api.Models;

/// <summary>Уровень загруженности маршрута — определяет цвет линии и времени на схеме.</summary>
public enum CongestionLevel
{
    Free,
    Normal,
    Heavy,
    Severe,
}

/// <summary>Ежедневная поездка с вариантами маршрута для сравнения.</summary>
/// <param name="OriginName">Точка старта («Дом»).</param>
/// <param name="OriginAddress">Адрес старта («Вешняковская 25/2»).</param>
/// <param name="DestinationName">Точка финиша («Работа»).</param>
/// <param name="DestinationAddress">Адрес финиша («Ак. Королева 10»).</param>
/// <param name="Routes">Варианты маршрута (сейчас ровно два: ТТК и МКАД).</param>
/// <param name="UpdatedAt">Когда бэкенд получил данные (UTC).</param>
public sealed record TrafficModel(
    string OriginName,
    string OriginAddress,
    string DestinationName,
    string DestinationAddress,
    IReadOnlyList<RouteModel> Routes,
    DateTimeOffset UpdatedAt);

/// <summary>Один вариант маршрута.</summary>
/// <param name="Id">Стабильный ключ («ttk», «mkad») — по нему фронтенд выбирает геометрию линии на схеме.</param>
/// <param name="Name">Название («Через ТТК»).</param>
/// <param name="DurationMinutes">Время в пути с учётом пробок, мин.</param>
/// <param name="Congestion">Уровень загруженности.</param>
/// <param name="DistanceKm">Длина маршрута, км.</param>
public sealed record RouteModel(
    string Id,
    string Name,
    int DurationMinutes,
    CongestionLevel Congestion,
    double DistanceKm);
