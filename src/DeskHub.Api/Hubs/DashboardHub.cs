using DeskHub.Api.Services.Traffic;
using Microsoft.AspNetCore.SignalR;

namespace DeskHub.Api.Hubs;

/// <summary>
/// Хаб /hubs/dashboard. Данные идут сервер → клиент через <see cref="DashboardNotifier"/> (IHubContext).
/// Клиент вызывает только служебные методы видимости пробок — для «спящего режима» TrafficWorker.
/// </summary>
public sealed class DashboardHub(ILogger<DashboardHub> logger, TrafficActivityTracker trafficActivity) : Hub
{
    public override Task OnConnectedAsync()
    {
        logger.LogInformation("Dashboard client connected: {ConnectionId}", Context.ConnectionId);
        return base.OnConnectedAsync();
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        logger.LogInformation("Dashboard client disconnected: {ConnectionId}", Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }

    /// <summary>Виджет пробок на экране (клиент пингует раз в 90 с, пока он виден).</summary>
    public void ReportTrafficVisible() => trafficActivity.ReportVisible();

    /// <summary>Данные пробок на клиенте устарели — обновить сейчас (не чаще раза в минуту).</summary>
    public void ForceTrafficRefresh() => trafficActivity.RequestRefresh();
}
