using DeskHub.Api.Models;

namespace DeskHub.Api.Services;

/// <summary>
/// Последние известные данные всех виджетов — источник для GET /api/dashboard/snapshot.
/// Обновляется <see cref="Hubs.DashboardNotifier"/> перед каждой рассылкой.
/// </summary>
public sealed class DashboardState(TimeProvider time)
{
    // Все данные — от воркеров; null до первого успешного обновления
    private volatile WeatherModel? _weather;
    private volatile TrafficModel? _traffic;
    private volatile TelemetryModel? _telemetry;
    private volatile CalendarModel? _calendar;

    public void SetWeather(WeatherModel weather) => _weather = weather;
    public void SetTraffic(TrafficModel traffic) => _traffic = traffic;
    public void SetTelemetry(TelemetryModel telemetry) => _telemetry = telemetry;
    public void SetCalendar(CalendarModel calendar) => _calendar = calendar;

    public DashboardSnapshot GetSnapshot() => new(_weather, _traffic, _telemetry, _calendar, time.GetUtcNow());
}
