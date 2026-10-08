using System.ComponentModel.DataAnnotations;
using System.Text.RegularExpressions;

namespace DeskHub.Api.Services.Calendar;

/// <summary>Один подписанный календарь (.ics): iCloud, Outlook, Google — любой публичный iCal-фид.</summary>
public sealed class CalendarSourceOptions
{
    /// <summary>webcal:// или https://. Ссылка открывает календарь без пароля — только в .env / user-secrets, в логи не пишется.</summary>
    public string Url { get; init; } = "";

    /// <summary>Цвет событий в стиле iOS, #RRGGBB.</summary>
    public string Color { get; init; } = "#007AFF";
}

public sealed partial class CalendarOptions
{
    public const string SectionName = "Calendar";
    public const string HttpClientName = "Calendar";

    /// <summary>Календари: Calendar:Sources:0:Url, Calendar:Sources:0:Color, … (в env — Calendar__Sources__0__Url).</summary>
    public List<CalendarSourceOptions> Sources { get; init; } = [];

    /// <summary>Устаревший одиночный URL (до мультикалендаря) — используется, только если Sources пуст.</summary>
    public string WebcalUrl { get; init; } = "";

    [Range(1, 240)]
    public int IntervalMinutes { get; init; } = 15;

    [Range(1, 60)]
    public int DaysAhead { get; init; } = 7;

    [Required]
    public string TimeZone { get; init; } = "Europe/Moscow";

    public IReadOnlyList<CalendarSourceOptions> EffectiveSources() =>
        Sources.Where(s => !string.IsNullOrWhiteSpace(s.Url)).ToList() is { Count: > 0 } list
            ? list
            : string.IsNullOrWhiteSpace(WebcalUrl) ? [] : [new CalendarSourceOptions { Url = WebcalUrl }];

    public bool HasValidColors() => Sources.All(s => HexColor().IsMatch(s.Color));

    [GeneratedRegex("^#[0-9A-Fa-f]{6}$")]
    private static partial Regex HexColor();
}
