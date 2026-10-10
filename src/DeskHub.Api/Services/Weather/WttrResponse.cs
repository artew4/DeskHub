using System.Text.Json;
using System.Text.Json.Serialization;

namespace DeskHub.Api.Services.Weather;

// Внутренние модели ответа https://wttr.in/<город>?format=j1&lang=ru — наружу не отдаются.
// Все числа wttr.in присылает строками ("13", "0.0") — читаются через JsonNumberHandling.AllowReadingFromString.
// Время прогноза, восхода и заката — местное время города без смещения.

internal sealed record WttrResponse(
    [property: JsonPropertyName("current_condition")] List<WttrCurrent> CurrentCondition,
    [property: JsonPropertyName("weather")] List<WttrDay> Weather)
{
    public static readonly JsonSerializerOptions JsonOptions = new()
    {
        NumberHandling = JsonNumberHandling.AllowReadingFromString,
    };
}

internal sealed record WttrCurrent(
    [property: JsonPropertyName("temp_C")] double TempC,
    [property: JsonPropertyName("FeelsLikeC")] double FeelsLikeC,
    [property: JsonPropertyName("weatherCode")] int WeatherCode,
    [property: JsonPropertyName("precipMM")] double PrecipMm,
    [property: JsonPropertyName("uvIndex")] double UvIndex,
    [property: JsonPropertyName("lang_ru")] List<WttrText>? LangRu,
    [property: JsonPropertyName("weatherDesc")] List<WttrText>? WeatherDesc);

internal sealed record WttrDay(
    [property: JsonPropertyName("date")] string Date,
    [property: JsonPropertyName("astronomy")] List<WttrAstronomy>? Astronomy,
    [property: JsonPropertyName("hourly")] List<WttrHour> Hourly);

/// <summary>Астрономия дня: время — «06:48 AM» (12h, местное), «No sunrise» в полярный день/ночь; освещённость — "0"…"100".</summary>
internal sealed record WttrAstronomy(
    [property: JsonPropertyName("sunrise")] string Sunrise,
    [property: JsonPropertyName("sunset")] string Sunset,
    [property: JsonPropertyName("moon_phase")] string? MoonPhase,
    [property: JsonPropertyName("moon_illumination")] int? MoonIllumination);

/// <summary>Прогноз с шагом 3 часа: Time = "0", "300", … "2100" (часы × 100).</summary>
internal sealed record WttrHour(
    [property: JsonPropertyName("time")] string Time,
    [property: JsonPropertyName("tempC")] double TempC,
    [property: JsonPropertyName("weatherCode")] int WeatherCode,
    [property: JsonPropertyName("chanceofrain")] int ChanceOfRain,
    [property: JsonPropertyName("chanceofsnow")] int ChanceOfSnow);

internal sealed record WttrText([property: JsonPropertyName("value")] string Value);
