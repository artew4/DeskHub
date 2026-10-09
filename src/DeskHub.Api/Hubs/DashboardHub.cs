using DeskHub.Api.Models;
using DeskHub.Api.Services.Power;
using DeskHub.Api.Services.Traffic;
using Microsoft.AspNetCore.SignalR;

namespace DeskHub.Api.Hubs;

/// <summary>
/// Хаб /hubs/dashboard. Данные идут сервер → клиент через <see cref="DashboardNotifier"/> (IHubContext).
/// Клиент вызывает только служебные методы: видимость пробок («спящий режим» TrafficWorker), WakeScreen и SetSleepMode (режим экрана).
/// </summary>
public sealed class DashboardHub(ILogger<DashboardHub> logger, TrafficActivityTracker trafficActivity, PowerModeService power) : Hub
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

    /// <summary>Касание чёрного экрана ночью: Sleep → Dimmed на 5 минут, затем снова Sleep.</summary>
    public PowerModeModel WakeScreen() => power.WakeTemporarily();

    /// <summary>Кнопка «В режим сна»: экран гаснет сразу (Sleep) до касания или до утра.</summary>
    public PowerModeModel SetSleepMode() => power.SleepNow();
}
