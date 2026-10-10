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
            Astronomy: MapAstronomy(response.Weather, today, tz),
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

    /// <summary>
    /// Восход/закат сегодня и восход завтра — абсолютными моментами в часовом поясе места; фаза и освещённость Луны.
    /// «Сегодня» — день текущей даты места (или первый в ответе); «завтра» — следующий по порядку день ответа.
    /// </summary>
    private static WeatherAstronomy? MapAstronomy(List<WttrDay> days, WttrDay? today, TimeZoneInfo tz)
    {
        var astronomy = today?.Astronomy?.FirstOrDefault();
        if (today is null || astronomy is null) return null;
        var tomorrow = days.SkipWhile(d => d != today).Skip(1).FirstOrDefault();

        return new WeatherAstronomy(
            Sunrise: At(today, astronomy.Sunrise, tz),
            Sunset: At(today, astronomy.Sunset, tz),
            NextSunrise: tomorrow?.Astronomy?.FirstOrDefault() is { } next ? At(tomorrow, next.Sunrise, tz) : null,
            MoonPhase: ParseMoonPhase(astronomy.MoonPhase),
            MoonIllumination: Math.Clamp(astronomy.MoonIllumination ?? 0, 0, 100));
    }

    /// <summary>Время суток дня day («06:48 AM» и др.) → момент со смещением часового пояса места; не разобрано — null.</summary>
    private static DateTimeOffset? At(WttrDay day, string clock, TimeZoneInfo tz)
    {
        if (!DateTime.TryParseExact(day.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) return null;
        if (!TryParseClock(clock, out var time)) return null;
        var wall = date + time;
        return new DateTimeOffset(wall, tz.GetUtcOffset(wall));
    }

    /// <summary>«Waxing Crescent» → WaxingCrescent: без пробелов и регистра («Third Quarter» = LastQuarter); неизвестное — Unknown.</summary>
    private static MoonPhase ParseMoonPhase(string? value)
    {
        var key = value?.Replace(" ", "", StringComparison.Ordinal);
        if (string.Equals(key, "ThirdQuarter", StringComparison.OrdinalIgnoreCase)) return MoonPhase.LastQuarter;
        return Enum.TryParse<MoonPhase>(key, ignoreCase: true, out var phase) && Enum.IsDefined(phase) ? phase : MoonPhase.Unknown;
    }

    /// <summary>День — между восходом и закатом дня (формат wttr.in «06:48 AM»); без данных астрономии — 07:00–20:00.</summary>
    private static bool IsDaytime(WttrDay? day, TimeSpan timeOfDay)
    {
        var astronomy = day?.Astronomy?.FirstOrDefault();
        if (astronomy is not null && TryParseClock(astronomy.Sunrise, out var sunrise) && TryParseClock(astronomy.Sunset, out var sunset))
            return timeOfDay >= sunrise && timeOfDay < sunset;
        return timeOfDay >= TimeSpan.FromHours(7) && timeOfDay < TimeSpan.FromHours(20);
    }

    /// <summary>
    /// wttr.in отдаёт время астрономии в 12-часовом формате («06:48 AM», «05:45 PM») независимо от lang;
    /// на всякий случай принимаются и варианты без ведущего нуля, без пробела, в нижнем регистре и 24-часовой «17:45».
    /// Культура — инвариантная: AM/PM не зависят от локали сервера.
    /// </summary>
    private static readonly string[] ClockFormats = ["hh:mm tt", "h:mm tt", "hh:mmtt", "h:mmtt", "HH:mm", "H:mm"];

    internal static bool TryParseClock(string? value, out TimeSpan time)
    {
        time = default;
        if (string.IsNullOrWhiteSpace(value)) return false;
        var ok = DateTime.TryParseExact(value.Trim().ToUpperInvariant(), ClockFormats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed);
        if (ok) time = parsed.TimeOfDay;
        return ok; // «No sunrise» / «No sunset» (полярный день/ночь) — false
    }
}
