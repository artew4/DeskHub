using System.ComponentModel.DataAnnotations;

namespace DeskHub.Api.Services.Weather;

/// <summary>Погода с wttr.in (бесплатно, без ключа, доступен из РФ; Open-Meteo на Hetzner заблокирован провайдером).</summary>
public sealed class WeatherOptions
{
    public const string SectionName = "Weather";
    public const string HttpClientName = "Weather";

    /// <summary>Город для wttr.in (как в URL: https://wttr.in/Moscow).</summary>
    [Required]
    public string City { get; init; } = "Moscow";

    /// <summary>Подпись на виджете.</summary>
    [Required]
    public string LocationName { get; init; } = "Москва";

    /// <summary>Интервал опроса. wttr.in обновляет наблюдения примерно раз в 15–60 минут — чаще смысла нет.</summary>
    [Range(5, 180)]
    public int IntervalMinutes { get; init; } = 15;

    /// <summary>Часовой пояс города: в нём wttr.in отдаёт время прогноза, восхода и заката (без смещения).</summary>
    [Required]
    public string TimeZone { get; init; } = "Europe/Moscow";

    [Required, Url]
    public string BaseUrl { get; init; } = "https://wttr.in/";
}
