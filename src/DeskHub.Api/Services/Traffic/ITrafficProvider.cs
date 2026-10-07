using DeskHub.Api.Models;

namespace DeskHub.Api.Services.Traffic;

/// <summary>Источник времени в пути по вариантам маршрута. Сейчас — мок; позже — API Яндекса.</summary>
public interface ITrafficProvider
{
    Task<IReadOnlyList<RouteModel>> GetRoutesAsync(CancellationToken ct);
}
