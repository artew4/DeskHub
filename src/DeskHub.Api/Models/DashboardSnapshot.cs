namespace DeskHub.Api.Models;

/// <summary>
/// Полное текущее состояние дашборда. Клиент запрашивает его при старте и после
/// каждого переподключения SignalR, далее получает изменения push-событиями.
/// </summary>
/// <param name="Weather">Погода; null, если данных ещё нет.</param>
/// <param name="Traffic">Маршруты (пустой список, если данных ещё нет).</param>
/// <param name="Telemetry">Последний замер телеметрии; null, если данных ещё нет.</param>
/// <param name="ServerTime">Время сервера — клиент сверяет с локальными часами.</param>
public sealed record DashboardSnapshot(
    WeatherModel? Weather,
    IReadOnlyList<TrafficModel> Traffic,
    TelemetryModel? Telemetry,
    DateTimeOffset ServerTime);
