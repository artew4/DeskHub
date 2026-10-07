using System.ComponentModel.DataAnnotations;

namespace DeskHub.Api.Services.Weather;

public sealed class OpenMeteoOptions
{
    public const string SectionName = "OpenMeteo";
    public const string HttpClientName = "OpenMeteo";

    [Range(-90, 90)]
    public double Latitude { get; init; } = 55.7558;

    [Range(-180, 180)]
    public double Longitude { get; init; } = 37.6173;

    [Required]
    public string LocationName { get; init; } = "Москва";

    /// <summary>Интервал опроса. Open-Meteo обновляет current раз в 15 минут — чаще смысла нет.</summary>
    [Range(1, 180)]
    public int IntervalMinutes { get; init; } = 15;

    [Required, Url]
    public string BaseUrl { get; init; } = "https://api.open-meteo.com/";
}
