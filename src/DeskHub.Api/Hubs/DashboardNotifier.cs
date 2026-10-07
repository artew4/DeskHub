using DeskHub.Api.Models;
using Microsoft.AspNetCore.SignalR;

namespace DeskHub.Api.Hubs;

/// <summary>
/// Рассылка обновлений всем клиентам дашборда. Экземпляр Hub живёт только в рамках одного
/// вызова от клиента, поэтому воркеры шлют события через IHubContext, а не через сам хаб.
/// </summary>
public sealed class DashboardNotifier(IHubContext<DashboardHub> hub)
{
    public Task SendWeatherUpdate(WeatherModel weather, CancellationToken ct = default) =>
        hub.Clients.All.SendAsync(HubEvents.WeatherUpdated, weather, ct);

    public Task SendTrafficUpdate(IReadOnlyList<TrafficModel> routes, CancellationToken ct = default) =>
        hub.Clients.All.SendAsync(HubEvents.TrafficUpdated, routes, ct);

    public Task SendTelemetryUpdate(TelemetryModel telemetry, CancellationToken ct = default) =>
        hub.Clients.All.SendAsync(HubEvents.TelemetryTick, telemetry, ct);
}
