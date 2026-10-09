namespace DeskHub.Api.Services.Weather;

/// <summary>
/// Коды погоды WorldWeatherOnline (их отдаёт wttr.in: 113, 116, 296…) → ключ иконки фронтенда и эквивалентный код WMO.
/// Ключи иконок — контракт с фронтендом (src/features/weather/weatherIcons.tsx), не меняются при смене провайдера;
/// WMO-код сохраняет смысл поля WeatherModel.WeatherCode, которое раньше заполнял Open-Meteo.
/// </summary>
public static class WwoCodes
{
    private enum Kind { Clear, PartlyCloudy, Cloudy, Fog, Drizzle, Rain, Sleet, Snow, Thunderstorm }

    public static (string Icon, int WmoCode) Describe(int wwoCode, bool isDay) => Classify(wwoCode) switch
    {
        Kind.Clear => (isDay ? "clear-day" : "clear-night", 0),
        Kind.PartlyCloudy => (isDay ? "partly-cloudy-day" : "partly-cloudy-night", 2),
        Kind.Cloudy => ("cloudy", 3),
        Kind.Fog => ("fog", 45),
        Kind.Drizzle => ("drizzle", 51),
        Kind.Rain => ("rain", 61),
        Kind.Sleet => ("sleet", 66),
        Kind.Snow => ("snow", 71),
        Kind.Thunderstorm => ("thunderstorm", 95),
        _ => ("cloudy", 3),
    };

    private static Kind Classify(int code) => code switch
    {
        113 => Kind.Clear, // Ясно / Солнечно
        116 => Kind.PartlyCloudy, // Переменная облачность
        119 or 122 => Kind.Cloudy, // Облачно, Пасмурно
        143 or 248 or 260 => Kind.Fog, // Дымка, Туман, Ледяной туман
        176 or 263 or 266 => Kind.Drizzle, // Местами дождь, Морось
        293 or 296 or 299 or 302 or 305 or 308 or 353 or 356 or 359 => Kind.Rain, // Дождь, ливни
        182 or 185 or 281 or 284 or 311 or 314 or 317 or 320 or 350 or 362 or 365 or 374 or 377 => Kind.Sleet, // Мокрый снег, ледяной дождь, крупа
        179 or 227 or 230 or 323 or 326 or 329 or 332 or 335 or 338 or 368 or 371 => Kind.Snow, // Снег, метель
        200 or 386 or 389 or 392 or 395 => Kind.Thunderstorm, // Гроза
        _ => Kind.Cloudy,
    };
}
