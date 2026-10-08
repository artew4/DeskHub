using System.ComponentModel.DataAnnotations;

namespace DeskHub.Api.Services.Traffic;

public sealed class TrafficOptions
{
    public const string SectionName = "Traffic";
    public const string YandexHttpClientName = "YandexMaps";

    [Range(1, 60)]
    public int IntervalMinutes { get; init; } = 5;

    /// <summary>Через сколько минут без пингов видимости виджета TrafficWorker засыпает («спящий режим»).</summary>
    [Range(0.1, 240)]
    public double IdleMinutes { get; init; } = 10;

    /// <summary>"Yandex" — реальные данные с Яндекс Карт; "Mock" — генератор для разработки без сети.</summary>
    [Required, RegularExpression("Yandex|Mock")]
    public string Provider { get; init; } = "Yandex";

    [Required] public string OriginName { get; init; } = "Дом";
    [Required] public string OriginAddress { get; init; } = "Вешняковская 25/2";
    [Range(-90, 90)] public double OriginLatitude { get; init; } = 55.736021;
    [Range(-180, 180)] public double OriginLongitude { get; init; } = 37.826279;

    [Required] public string DestinationName { get; init; } = "Работа";
    [Required] public string DestinationAddress { get; init; } = "Ак. Королева 10";
    [Range(-90, 90)] public double DestinationLatitude { get; init; } = 55.822452;
    [Range(-180, 180)] public double DestinationLongitude { get; init; } = 37.606012;

    [Required, Url] public string YandexBaseUrl { get; init; } = "https://yandex.ru/";
}
