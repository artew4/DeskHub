using System.Globalization;
using DeskHub.Api.Models;

namespace DeskHub.Api.Services.Weather;

public static class OpenMeteoMapper
{
    private const int HourlyHours = 24;

    public static WeatherModel ToWeatherModel(OpenMeteoResponse response, string locationName, DateTimeOffset now)
    {
        var offset = TimeSpan.FromSeconds(response.UtcOffsetSeconds);
        var current = response.Current;
        var isDay = current.IsDay == 1;
        var (description, icon) = WeatherCodes.Describe(current.WeatherCode, isDay);

        return new WeatherModel(
            LocationName: locationName,
            Temperature: current.Temperature,
            ApparentTemperature: current.ApparentTemperature,
            WeatherCode: current.WeatherCode,
            Description: description,
            Icon: icon,
            IsDay: isDay,
            Precipitation: current.Precipitation,
            UvIndex: current.UvIndex,
            Hourly: MapHourly(response.Hourly, offset, now),
            UpdatedAt: now);
    }

    /// <summary>Часы начиная с текущего (его начало ≤ now) и далее, не больше <see cref="HourlyHours"/>.</summary>
    private static List<HourlyForecast> MapHourly(OpenMeteoHourly hourly, TimeSpan offset, DateTimeOffset now)
    {
        var currentHourStart = now.AddTicks(-(now.Ticks % TimeSpan.TicksPerHour)).AddHours(-1);
        var result = new List<HourlyForecast>(HourlyHours);

        for (var i = 0; i < hourly.Time.Length && result.Count < HourlyHours; i++)
        {
            var time = ParseLocalTime(hourly.Time[i], offset);
            if (time <= currentHourStart) continue;

            var code = hourly.WeatherCode[i];
            result.Add(new HourlyForecast(
                Time: time,
                Temperature: hourly.Temperature[i],
                WeatherCode: code,
                Icon: WeatherCodes.Describe(code, hourly.IsDay[i] == 1).Icon,
                PrecipitationProbability: hourly.PrecipitationProbability[i] ?? 0));
        }

        return result;
    }

    /// <summary>"2026-10-07T21:00" + смещение места → DateTimeOffset.</summary>
    internal static DateTimeOffset ParseLocalTime(string value, TimeSpan offset) =>
        new(DateTime.ParseExact(value, "yyyy-MM-dd'T'HH:mm", CultureInfo.InvariantCulture), offset);
}
