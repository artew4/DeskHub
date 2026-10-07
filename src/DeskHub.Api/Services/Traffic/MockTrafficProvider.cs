using DeskHub.Api.Models;

namespace DeskHub.Api.Services.Traffic;

/// <summary>
/// Правдоподобный мок двух вариантов поездки Вешняковская → Ак. Королева:
/// - «Через ТТК»: короче (~20 км), но время сильно скачет — 35…70 мин;
/// - «Через МКАД»: длиннее (~28 км), время стабильное — 45…55 мин.
/// Время меняется случайным блужданием от предыдущего значения, а не независимым случайным числом,
/// чтобы соседние обновления выглядели как реальная динамика пробок.
/// </summary>
public sealed class MockTrafficProvider : ITrafficProvider
{
    private sealed record Profile(string Id, string Name, double BaseKm, double MinMinutes, double MaxMinutes, double MaxStep, double FreeFlowMinutes);

    private static readonly Profile Ttk = new("ttk", "Через ТТК", 20.0, 35, 70, 9, 32);
    private static readonly Profile Mkad = new("mkad", "Через МКАД", 28.0, 45, 55, 2.5, 42);

    private readonly Lock _lock = new();
    private double _ttkMinutes = 48;
    private double _mkadMinutes = 49;

    public Task<IReadOnlyList<RouteModel>> GetRoutesAsync(CancellationToken ct)
    {
        lock (_lock)
        {
            _ttkMinutes = Step(_ttkMinutes, Ttk);
            _mkadMinutes = Step(_mkadMinutes, Mkad);

            IReadOnlyList<RouteModel> routes = [Build(Ttk, _ttkMinutes), Build(Mkad, _mkadMinutes)];
            return Task.FromResult(routes);
        }
    }

    private static double Step(double current, Profile p)
    {
        // У ТТК изредка резкий скачок (ДТП/рассасывание пробки)
        var jump = p.Id == "ttk" && Random.Shared.NextDouble() < 0.15 ? 3 : 1;
        var next = current + (Random.Shared.NextDouble() * 2 - 1) * p.MaxStep * jump;
        return Math.Clamp(next, p.MinMinutes, p.MaxMinutes);
    }

    private static RouteModel Build(Profile p, double minutes) => new(
        Id: p.Id,
        Name: p.Name,
        DurationMinutes: (int)Math.Round(minutes),
        Congestion: CongestionClassifier.Classify(minutes, p.FreeFlowMinutes),
        // Навигатор может слегка менять вариант внутри маршрута — ±0.4 км
        DistanceKm: Math.Round(p.BaseKm + (Random.Shared.NextDouble() - 0.5) * 0.8, 1));
}
