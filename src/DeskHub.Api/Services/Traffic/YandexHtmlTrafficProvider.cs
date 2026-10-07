using System.Globalization;
using DeskHub.Api.Models;
using Microsoft.Extensions.Options;

namespace DeskHub.Api.Services.Traffic;

/// <summary>
/// Время в пути «Дом → Работа» с веб-версии Яндекс Карт (один GET раз в Traffic:IntervalMinutes).
///
/// Яндекс сам предлагает несколько вариантов маршрута. Нужные выбираются по дорогам, по которым они идут
/// (segments[].street), а не по длине — длины вариантов близки (23–32 км) и меняются с пробками:
/// - «Через МКАД»: самый быстрый вариант, в котором есть «МКАД»;
/// - «Через ТТК»: самый быстрый вариант с «ТТК» (без МКАД). Если Яндекс сейчас не предлагает путь через ТТК —
///   самый быстрый из остальных городских, честно подписанный «Через центр».
/// Ошибки (сеть, капча, смена вёрстки) пробрасываются: воркер логирует и не рассылает данные —
/// на экране остаются последние, фронтенд пометит их устаревшими.
/// </summary>
public sealed class YandexHtmlTrafficProvider(
    IHttpClientFactory httpClientFactory,
    IOptions<TrafficOptions> options,
    ILogger<YandexHtmlTrafficProvider> logger) : ITrafficProvider
{
    private static readonly string[] TtkNames = ["ТТК", "Третье транспортное кольцо"];
    private static readonly string[] MkadNames = ["МКАД"];

    public async Task<IReadOnlyList<RouteModel>> GetRoutesAsync(CancellationToken ct)
    {
        var client = httpClientFactory.CreateClient(TrafficOptions.YandexHttpClientName);
        using var response = await client.GetAsync(BuildUrl(options.Value), ct);

        var finalUri = response.RequestMessage?.RequestUri;
        if (finalUri?.AbsolutePath.Contains("captcha", StringComparison.OrdinalIgnoreCase) == true)
            throw new YandexParseException($"Yandex returned a captcha ({finalUri.GetLeftPart(UriPartial.Path)})");
        response.EnsureSuccessStatusCode();

        var html = await response.Content.ReadAsStringAsync(ct);
        var parsed = YandexRouteParser.Parse(html);

        logger.LogDebug("Yandex offered {Count} routes: {Routes}", parsed.Count, string.Join("; ", parsed.Select(Describe)));

        var routes = SelectRoutes(parsed);
        return routes.Count > 0 ? routes : throw new YandexParseException("No routes matched TTK/MKAD");
    }

    internal static List<RouteModel> SelectRoutes(IReadOnlyList<YandexRoute> parsed)
    {
        var byTime = parsed.OrderBy(r => r.DurationInTrafficSeconds).ToList();

        var mkad = byTime.FirstOrDefault(r => GoesVia(r, MkadNames));
        var ttk = byTime.FirstOrDefault(r => GoesVia(r, TtkNames) && !GoesVia(r, MkadNames));
        var ttkName = "Через ТТК";
        if (ttk is null)
        {
            ttk = byTime.FirstOrDefault(r => !GoesVia(r, MkadNames));
            ttkName = "Через центр";
        }

        var result = new List<RouteModel>(2);
        if (ttk is not null) result.Add(ToModel("ttk", ttkName, ttk));
        if (mkad is not null) result.Add(ToModel("mkad", "Через МКАД", mkad));
        return result;
    }

    private static bool GoesVia(YandexRoute route, string[] names) => names.Any(route.Streets.Contains);

    private static RouteModel ToModel(string id, string name, YandexRoute route) => new(
        Id: id,
        Name: name,
        DurationMinutes: (int)Math.Round(route.DurationInTrafficSeconds / 60),
        // База — время этого же маршрута по пустой дороге, которое отдаёт сам Яндекс
        Congestion: CongestionClassifier.Classify(route.DurationInTrafficSeconds, route.DurationSeconds),
        DistanceKm: Math.Round(route.DistanceMeters / 1000, 1));

    private static string BuildUrl(TrafficOptions o) => string.Create(CultureInfo.InvariantCulture,
        $"maps/?rtext={o.OriginLatitude},{o.OriginLongitude}~{o.DestinationLatitude},{o.DestinationLongitude}&rtt=auto");

    private static string Describe(YandexRoute r) => string.Create(CultureInfo.InvariantCulture,
        $"{r.DistanceMeters / 1000:F1} km {r.DurationInTrafficSeconds / 60:F0}/{r.DurationSeconds / 60:F0} min via {string.Join("|", r.Streets.Where(s => s is "ТТК" or "МКАД" or "МСД"))}");
}
