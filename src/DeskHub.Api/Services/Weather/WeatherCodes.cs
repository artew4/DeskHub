namespace DeskHub.Api.Services.Weather;

/// <summary>
/// Коды погоды WMO (как их отдаёт Open-Meteo) → описание и ключ иконки.
/// Ключи иконок — контракт с фронтендом (src/features/weather/weatherIcons.ts).
/// </summary>
public static class WeatherCodes
{
    public static (string Description, string Icon) Describe(int code, bool isDay) => code switch
    {
        0 => ("Ясно", isDay ? "clear-day" : "clear-night"),
        1 => ("Преимущественно ясно", isDay ? "partly-cloudy-day" : "partly-cloudy-night"),
        2 => ("Переменная облачность", isDay ? "partly-cloudy-day" : "partly-cloudy-night"),
        3 => ("Пасмурно", "cloudy"),
        45 or 48 => ("Туман", "fog"),
        51 => ("Слабая морось", "drizzle"),
        53 => ("Морось", "drizzle"),
        55 => ("Сильная морось", "drizzle"),
        56 or 57 => ("Ледяная морось", "sleet"),
        61 => ("Небольшой дождь", "rain"),
        63 => ("Дождь", "rain"),
        65 => ("Сильный дождь", "rain"),
        66 or 67 => ("Ледяной дождь", "sleet"),
        71 => ("Небольшой снег", "snow"),
        73 => ("Снег", "snow"),
        75 => ("Сильный снег", "snow"),
        77 => ("Снежная крупа", "snow"),
        80 => ("Небольшой ливень", "rain"),
        81 => ("Ливень", "rain"),
        82 => ("Сильный ливень", "rain"),
        85 => ("Снегопад", "snow"),
        86 => ("Сильный снегопад", "snow"),
        95 => ("Гроза", "thunderstorm"),
        96 or 99 => ("Гроза с градом", "thunderstorm"),
        _ => ("Нет данных", "cloudy"),
    };
}
