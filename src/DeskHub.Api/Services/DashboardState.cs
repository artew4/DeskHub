using DeskHub.Api.Models;

namespace DeskHub.Api.Services;

/// <summary>
/// Последние известные данные всех виджетов — источник для GET /api/dashboard/snapshot.
/// Обновляется <see cref="Hubs.DashboardNotifier"/> перед каждой рассылкой.
/// </summary>
public sealed class DashboardState(TimeProvider time)
{
    // Погода — от WeatherWorker (null до первого успешного запроса); пробки — заглушка до TrafficWorker
    private volatile WeatherModel? _weather;
    private volatile IReadOnlyList<TrafficModel> _traffic = StubData.Traffic(time.GetUtcNow());
    private volatile TelemetryModel? _telemetry;

    public void SetWeather(WeatherModel weather) => _weather = weather;
    public void SetTraffic(IReadOnlyList<TrafficModel> traffic) => _traffic = traffic;
    public void SetTelemetry(TelemetryModel telemetry) => _telemetry = telemetry;

    public DashboardSnapshot GetSnapshot() => new(_weather, _traffic, _telemetry, time.GetUtcNow());
}
