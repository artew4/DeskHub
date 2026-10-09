using DeskHub.Api.Models;
using DeskHub.Api.Services;
using Microsoft.AspNetCore.SignalR;

namespace DeskHub.Api.Hubs;

/// <summary>
/// Рассылка обновлений всем клиентам дашборда. Экземпляр Hub живёт только в рамках одного
/// вызова от клиента, поэтому воркеры шлют события через IHubContext, а не через сам хаб.
/// Сначала обновляется <see cref="DashboardState"/>, потом пуш — переподключившийся
/// между этими шагами клиент получит актуальный snapshot.
/// </summary>
public sealed class DashboardNotifier(IHubContext<DashboardHub> hub, DashboardState state)
{
    public Task SendWeatherUpdate(WeatherModel weather, CancellationToken ct = default)
    {
        state.SetWeather(weather);
        return hub.Clients.All.SendAsync(HubEvents.WeatherUpdated, weather, ct);
    }

    public Task SendTrafficUpdate(TrafficModel traffic, CancellationToken ct = default)
    {
        state.SetTraffic(traffic);
        return hub.Clients.All.SendAsync(HubEvents.TrafficUpdated, traffic, ct);
    }

    public Task SendCalendarUpdate(CalendarModel calendar, CancellationToken ct = default)
    {
        state.SetCalendar(calendar);
        return hub.Clients.All.SendAsync(HubEvents.CalendarUpdated, calendar, ct);
    }

    public Task SendPowerModeUpdate(PowerModeModel power, CancellationToken ct = default) =>
        hub.Clients.All.SendAsync(HubEvents.PowerModeChanged, power, ct); // DashboardState обновляет PowerModeService

    public Task SendTelemetryUpdate(TelemetryModel telemetry, CancellationToken ct = default)
    {
        state.SetTelemetry(telemetry);
        return hub.Clients.All.SendAsync(HubEvents.TelemetryTick, telemetry, ct);
    }
}
