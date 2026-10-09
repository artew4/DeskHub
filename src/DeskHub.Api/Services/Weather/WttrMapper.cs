using System.Globalization;
using DeskHub.Api.Models;

namespace DeskHub.Api.Services.Weather;

/// <summary>
/// Ответ wttr.in → прежняя модель <see cref="WeatherModel"/>: фронтенд получает те же поля, что и от Open-Meteo.
/// </summary>
internal static class WttrMapper
{
    /// <summary>Прогноз на 2 суток вперёд (16 точек по 3 часа) — хватает для «Завтра» даже из 23:xx.</summary>
    private const int MaxHourly = 16;
    private static readonly TimeSpan Step = TimeSpan.FromHours(3);

    public static WeatherModel ToWeatherModel(WttrResponse response, string locationName, DateTimeOffset now, TimeZoneInfo tz)
    {
        var current = response.CurrentCondition.FirstOrDefault() ?? throw new InvalidDataException("wttr.in: no current_condition");
        var localNow = TimeZoneInfo.ConvertTime(now, tz);
        var today = response.Weather.FirstOrDefault(d => d.Date == localNow.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture))
            ?? response.Weather.FirstOrDefault();

        var isDay = IsDaytime(today, localNow.TimeOfDay);
        var (icon, wmo) = WwoCodes.Describe(current.WeatherCode, isDay);

        return new WeatherModel(
            LocationName: locationName,
            Temperature: current.TempC,
            ApparentTemperature: current.FeelsLikeC,
            WeatherCode: wmo,
            Description: Describe(current),
            Icon: icon,
            IsDay: isDay,
            Precipitation: current.PrecipMm,
            UvIndex: current.UvIndex,
            Hourly: MapHourly(response.Weather, localNow, tz),
            UpdatedAt: now);
    }

    /// <summary>Описание по-русски из lang_ru (wttr.in с lang=ru), иначе английское weatherDesc; с заглавной буквы.</summary>
    private static string Describe(WttrCurrent current)
    {
        var text = current.LangRu?.FirstOrDefault()?.Value?.Trim();
        if (string.IsNullOrEmpty(text)) text = current.WeatherDesc?.FirstOrDefault()?.Value?.Trim();
        if (string.IsNullOrEmpty(text)) return "Нет данных";
        return char.ToUpper(text[0], CultureInfo.GetCultureInfo("ru-RU")) + text[1..];
    }

    /// <summary>
    /// Точки прогноза (шаг 3 ч, местное время города) начиная с текущего трёхчасового блока.
    /// Фронтенд сам выбирает нужные часы (selectForecast) — ему всё равно, шаг 1 ч или 3 ч.
    /// </summary>
    private static List<HourlyForecast> MapHourly(List<WttrDay> days, DateTimeOffset localNow, TimeZoneInfo tz)
    {
        var result = new List<HourlyForecast>(MaxHourly);
        foreach (var day in days)
        {
            if (!DateTime.TryParseExact(day.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) continue;
            foreach (var hour in day.Hourly)
            {
                if (!int.TryParse(hour.Time, NumberStyles.Integer, CultureInfo.InvariantCulture, out var hhmm)) continue;
                var wall = date.AddHours(hhmm / 100).AddMinutes(hhmm % 100);
                var time = new DateTimeOffset(wall, tz.GetUtcOffset(wall));
                if (time + Step <= localNow) continue; // блок уже закончился

                var (icon, wmo) = WwoCodes.Describe(hour.WeatherCode, IsDaytime(day, wall.TimeOfDay));
                result.Add(new HourlyForecast(
                    Time: time,
                    Temperature: hour.TempC,
                    WeatherCode: wmo,
                    Icon: icon,
                    PrecipitationProbability: Math.Max(hour.ChanceOfRain, hour.ChanceOfSnow)));
                if (result.Count == MaxHourly) return result;
            }
        }
        return result;
    }

    /// <summary>День — между восходом и закатом дня (формат wttr.in «06:48 AM»); без данных астрономии — 07:00–20:00.</summary>
    private static bool IsDaytime(WttrDay? day, TimeSpan timeOfDay)
    {
        var astronomy = day?.Astronomy?.FirstOrDefault();
        if (astronomy is not null && TryParseClock(astronomy.Sunrise, out var sunrise) && TryParseClock(astronomy.Sunset, out var sunset))
            return timeOfDay >= sunrise && timeOfDay < sunset;
        return timeOfDay >= TimeSpan.FromHours(7) && timeOfDay < TimeSpan.FromHours(20);
    }

    private static bool TryParseClock(string value, out TimeSpan time)
    {
        var ok = DateTime.TryParseExact(value.Trim(), "hh:mm tt", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed);
        time = parsed.TimeOfDay;
        return ok; // «No sunrise» / «No sunset» (полярный день/ночь) — false
    }
}
