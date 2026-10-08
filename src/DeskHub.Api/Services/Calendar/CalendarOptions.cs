using System.ComponentModel.DataAnnotations;

namespace DeskHub.Api.Services.Calendar;

public sealed class CalendarOptions
{
    public const string SectionName = "Calendar";
    public const string HttpClientName = "AppleCalendar";

    /// <summary>
    /// Публичная ссылка на календарь iCloud (webcal://… или https://…). Пусто — календарь не подключён.
    /// Ссылка даёт доступ к событиям без пароля — хранится только в .env, в логи не пишется.
    /// </summary>
    public string WebcalUrl { get; init; } = "";

    [Range(1, 240)]
    public int IntervalMinutes { get; init; } = 15;

    /// <summary>Сколько дней вперёд от сегодня брать события (агенда — сегодня и завтра, точки в сетке месяца).</summary>
    [Range(1, 60)]
    public int DaysAhead { get; init; } = 7;

    /// <summary>Часовой пояс устройства (IANA) — для событий без пояса и событий «весь день».</summary>
    [Required]
    public string TimeZone { get; init; } = "Europe/Moscow";
}
