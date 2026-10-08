namespace DeskHub.Api.Models;

/// <summary>
/// Полное текущее состояние дашборда. Клиент запрашивает его при старте и после
/// каждого переподключения SignalR, далее получает изменения push-событиями.
/// </summary>
/// <param name="Weather">Погода; null, если данных ещё нет.</param>
/// <param name="Traffic">Поездка и варианты маршрута; null, если данных ещё нет.</param>
/// <param name="Telemetry">Последний замер телеметрии; null, если данных ещё нет.</param>
/// <param name="Calendar">События календаря; null, если календарь не подключён или ещё не загружен.</param>
/// <param name="ServerTime">Время сервера — клиент сверяет с локальными часами.</param>
public sealed record DashboardSnapshot(
    WeatherModel? Weather,
    TrafficModel? Traffic,
    TelemetryModel? Telemetry,
    CalendarModel? Calendar,
    DateTimeOffset ServerTime);
