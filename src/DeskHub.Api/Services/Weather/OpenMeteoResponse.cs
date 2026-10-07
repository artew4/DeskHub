using System.Text.Json.Serialization;

namespace DeskHub.Api.Services.Weather;

// Внутренние модели ответа Open-Meteo /v1/forecast — наружу не отдаются.
// Времена приходят в локальном времени места (timezone=auto) без смещения; смещение — utc_offset_seconds.

public sealed record OpenMeteoResponse(
    [property: JsonPropertyName("utc_offset_seconds")] int UtcOffsetSeconds,
    [property: JsonPropertyName("current")] OpenMeteoCurrent Current,
    [property: JsonPropertyName("hourly")] OpenMeteoHourly Hourly);

public sealed record OpenMeteoCurrent(
    [property: JsonPropertyName("time")] string Time,
    [property: JsonPropertyName("temperature_2m")] double Temperature,
    [property: JsonPropertyName("apparent_temperature")] double ApparentTemperature,
    [property: JsonPropertyName("weather_code")] int WeatherCode,
    [property: JsonPropertyName("precipitation")] double Precipitation,
    [property: JsonPropertyName("is_day")] int IsDay,
    [property: JsonPropertyName("uv_index")] double UvIndex);

/// <summary>Параллельные массивы: элемент i каждого массива относится к часу Time[i].</summary>
public sealed record OpenMeteoHourly(
    [property: JsonPropertyName("time")] string[] Time,
    [property: JsonPropertyName("temperature_2m")] double[] Temperature,
    [property: JsonPropertyName("weather_code")] int[] WeatherCode,
    [property: JsonPropertyName("is_day")] int[] IsDay,
    [property: JsonPropertyName("precipitation_probability")] int?[] PrecipitationProbability);
