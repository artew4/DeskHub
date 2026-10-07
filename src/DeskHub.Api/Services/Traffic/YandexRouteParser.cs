using System.Text.Json;
using System.Text.RegularExpressions;

namespace DeskHub.Api.Services.Traffic;

/// <summary>Вариант маршрута, извлечённый из страницы Яндекс Карт.</summary>
/// <param name="DistanceMeters">Длина маршрута, м.</param>
/// <param name="DurationSeconds">Время по пустой дороге, с (поле duration).</param>
/// <param name="DurationInTrafficSeconds">Время с учётом пробок, с (поле durationInTraffic).</param>
/// <param name="Streets">Названия дорог по ходу маршрута (segments[].street), в т.ч. «ТТК», «МКАД».</param>
public sealed record YandexRoute(
    double DistanceMeters,
    double DurationSeconds,
    double DurationInTrafficSeconds,
    IReadOnlySet<string> Streets);

public sealed class YandexParseException(string message) : Exception(message);

/// <summary>
/// Разбор HTML страницы https://yandex.ru/maps/?rtext=…&amp;rtt=auto.
///
/// Яндекс рендерит маршруты на сервере и кладёт всё состояние страницы одним JSON в
/// &lt;script class="state-view"&gt;. Regex используется ТОЛЬКО чтобы вырезать этот JSON,
/// сам JSON разбирается System.Text.Json — это устойчивее, чем ловить "time":(\d+) регулярками
/// (такие поля есть и у сотен сегментов, и у общественного транспорта).
///
/// Структура (проверено 07.10.2026):
///   config.routerResponse.routes[] {
///     distance: { value: метры, text: "24,9 км" },
///     duration: секунды без пробок,
///     durationInTraffic: секунды с пробками,
///     paths[].segments[].street: "Вешняковская улица" | "ТТК" | "МКАД" | …
///   }
/// </summary>
public static partial class YandexRouteParser
{
    [GeneratedRegex("""<script[^>]*class="state-view"[^>]*>(?<json>.*?)</script>""", RegexOptions.Singleline)]
    private static partial Regex StateViewRegex();

    public static IReadOnlyList<YandexRoute> Parse(string html)
    {
        var match = StateViewRegex().Match(html);
        if (!match.Success)
        {
            throw new YandexParseException(html.Contains("captcha", StringComparison.OrdinalIgnoreCase)
                ? "No state-view script: probably a captcha page"
                : "No state-view script in page: layout changed?");
        }

        using var document = JsonDocument.Parse(match.Groups["json"].ValueSpan.ToString());
        var routerResponse = FindRouterResponse(document.RootElement)
            ?? throw new YandexParseException("routerResponse not found in state-view JSON");

        var routes = new List<YandexRoute>();
        foreach (var route in routerResponse.GetProperty("routes").EnumerateArray())
        {
            if (TryParseRoute(route) is { } parsed) routes.Add(parsed);
        }

        return routes.Count > 0 ? routes : throw new YandexParseException("routerResponse contains no auto routes");
    }

    /// <summary>Обычно config.routerResponse; на случай перестановок — поиск по всему дереву.</summary>
    private static JsonElement? FindRouterResponse(JsonElement root)
    {
        if (root.TryGetProperty("config", out var config) &&
            config.TryGetProperty("routerResponse", out var direct) &&
            direct.TryGetProperty("routes", out _))
        {
            return direct;
        }

        var stack = new Stack<JsonElement>([root]);
        while (stack.Count > 0)
        {
            var element = stack.Pop();
            if (element.ValueKind == JsonValueKind.Object)
            {
                if (element.TryGetProperty("routerResponse", out var found) && found.TryGetProperty("routes", out _))
                    return found;
                foreach (var property in element.EnumerateObject()) stack.Push(property.Value);
            }
            else if (element.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in element.EnumerateArray()) stack.Push(item);
            }
        }
        return null;
    }

    private static YandexRoute? TryParseRoute(JsonElement route)
    {
        if (route.TryGetProperty("type", out var type) && type.GetString() is { } t && t != "auto") return null;
        if (!route.TryGetProperty("distance", out var distance) ||
            !distance.TryGetProperty("value", out var meters) ||
            !route.TryGetProperty("durationInTraffic", out var inTraffic))
        {
            return null;
        }

        var duration = route.TryGetProperty("duration", out var d) ? d.GetDouble() : inTraffic.GetDouble();

        var streets = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (route.TryGetProperty("paths", out var paths))
        {
            foreach (var path in paths.EnumerateArray())
            {
                if (!path.TryGetProperty("segments", out var segments)) continue;
                foreach (var segment in segments.EnumerateArray())
                {
                    if (segment.TryGetProperty("street", out var street) && street.GetString() is { Length: > 0 } name)
                        streets.Add(name);
                }
            }
        }

        return new YandexRoute(meters.GetDouble(), duration, inTraffic.GetDouble(), streets);
    }
}
