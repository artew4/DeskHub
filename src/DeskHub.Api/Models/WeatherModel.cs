namespace DeskHub.Api.Models;

/// <summary>Погода для виджета дашборда (источник — Open-Meteo через WeatherWorker).</summary>
/// <param name="LocationName">Название места («Москва»).</param>
/// <param name="Temperature">Температура воздуха, °C.</param>
/// <param name="ApparentTemperature">«Ощущается как», °C.</param>
/// <param name="WeatherCode">Код погоды WMO.</param>
/// <param name="Description">Текстовое описание («Переменная облачность»).</param>
/// <param name="Icon">Ключ иконки для фронтенда (см. <see cref="Services.Weather.WeatherCodes"/>).</param>
/// <param name="IsDay">День ли сейчас (для иконок солнце/луна, показа УФ).</param>
/// <param name="Precipitation">Осадки за последний час, мм.</param>
/// <param name="UvIndex">УФ-индекс.</param>
/// <param name="Hourly">Почасовой прогноз начиная с текущего часа (до 24 ч).</param>
/// <param name="Astronomy">Восход/закат и фаза Луны (Hero-виджет погоды); null — wttr.in не прислал астрономию.</param>
/// <param name="UpdatedAt">Когда бэкенд получил данные (UTC).</param>
public sealed record WeatherModel(
    string LocationName,
    double Temperature,
    double ApparentTemperature,
    int WeatherCode,
    string Description,
    string Icon,
    bool IsDay,
    double Precipitation,
    double UvIndex,
    IReadOnlyList<HourlyForecast> Hourly,
    WeatherAstronomy? Astronomy,
    DateTimeOffset UpdatedAt);

/// <summary>Один час прогноза.</summary>
/// <param name="Time">Начало часа (со смещением часового пояса места).</param>
/// <param name="Temperature">Температура, °C.</param>
/// <param name="WeatherCode">Код погоды WMO.</param>
/// <param name="Icon">Ключ иконки.</param>
/// <param name="PrecipitationProbability">Вероятность осадков, %.</param>
public sealed record HourlyForecast(
    DateTimeOffset Time,
    double Temperature,
    int WeatherCode,
    string Icon,
    int PrecipitationProbability);

/// <summary>
/// Астрономия для «неба» Hero-виджета. Моменты — абсолютные (со смещением часового пояса места), чтобы фронтенд
/// считал положение светил без знания формата wttr.in. null — полярный день/ночь («No sunrise») или нет данных.
/// </summary>
/// <param name="Sunrise">Восход сегодня.</param>
/// <param name="Sunset">Закат сегодня.</param>
/// <param name="NextSunrise">Восход завтра — конец ночной дуги Луны после заката.</param>
/// <param name="MoonPhase">Фаза Луны.</param>
/// <param name="MoonIllumination">Освещённая доля диска, % (0–100).</param>
public sealed record WeatherAstronomy(
    DateTimeOffset? Sunrise,
    DateTimeOffset? Sunset,
    DateTimeOffset? NextSunrise,
    MoonPhase MoonPhase,
    int MoonIllumination);

/// <summary>Фаза Луны (wttr.in moon_phase: «New Moon», «Waxing Crescent», …).</summary>
public enum MoonPhase
{
    Unknown,
    NewMoon,
    WaxingCrescent,
    FirstQuarter,
    WaxingGibbous,
    FullMoon,
    WaningGibbous,
    LastQuarter,
    WaningCrescent,
}
