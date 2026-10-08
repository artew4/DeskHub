using DeskHub.Api.Models;
using Ical.Net;
using Ical.Net.CalendarComponents;
using Ical.Net.DataTypes;
using IcalCalendar = Ical.Net.Calendar;

namespace DeskHub.Api.Services.Calendar;

/// <summary>
/// .ics → события на диапазон дат. Повторяющиеся события (RRULE/RDATE/EXDATE) разворачивает
/// Ical.Net (v5: Calendar.GetOccurrences + TakeWhileBefore).
///
/// Время (проверено на тестовом календаре):
/// - с TZID или в UTC — переводится через AsUtc в часовой пояс устройства;
/// - «плавающее» (без пояса) — AsUtc ошибочно считает его UTC, поэтому трактуется как время устройства;
/// - «весь день» (VALUE=DATE) — полночь даты в поясе устройства, конец не включительно.
/// </summary>
/// <summary>Диапазон дат, за который собираются события: [Start; End) в поясе устройства.</summary>
public sealed record CalendarRange(DateTimeOffset Start, DateTimeOffset End, TimeZoneInfo TimeZone)
{
    /// <summary>[сегодня 00:00; max(сегодня + daysAhead + 1 день, 1-е число следующего месяца)).</summary>
    public static CalendarRange For(DateTimeOffset now, TimeZoneInfo tz, int daysAhead)
    {
        var today = TimeZoneInfo.ConvertTime(now, tz).Date;
        var firstOfNextMonth = new DateTime(today.Year, today.Month, 1).AddMonths(1);
        var end = today.AddDays(daysAhead + 1) > firstOfNextMonth ? today.AddDays(daysAhead + 1) : firstOfNextMonth;
        return new CalendarRange(IcsCalendarParser.AtLocal(today, tz), IcsCalendarParser.AtLocal(end, tz), tz);
    }
}

public static class IcsCalendarParser
{
    /// <summary>Запас назад при поиске: многодневное событие могло начаться раньше диапазона.</summary>
    private static readonly TimeSpan LookBehind = TimeSpan.FromDays(31);
    /// <summary>Предел на один календарь — защита от гигантских фидов.</summary>
    private const int MaxEventsPerSource = 300;

    /// <summary>События одного календаря в диапазоне; каждому присваивается цвет календаря.</summary>
    public static List<CalendarEventModel> Parse(Stream ics, CalendarRange range, string color)
    {
        var calendar = IcalCalendar.Load(ics) ?? throw new InvalidDataException("Empty iCalendar");
        var tz = range.TimeZone;
        var (rangeStart, rangeEnd) = (range.Start, range.End);

        var searchFrom = new CalDateTime(rangeStart.DateTime - LookBehind, tz.Id, hasTime: true);
        var searchTo = new CalDateTime(rangeEnd.DateTime, tz.Id, hasTime: true);

        var events = new List<CalendarEventModel>();
        foreach (var occurrence in calendar.GetOccurrences(searchFrom).TakeWhileBefore(searchTo))
        {
            if (occurrence.Source is not CalendarEvent source) continue;

            var start = ToLocal(occurrence.Period.StartTime, tz);
            var end = occurrence.Period.EffectiveEndTime is { } e ? ToLocal(e, tz) : start;
            if (end <= rangeStart || start >= rangeEnd) continue; // не пересекается с диапазоном

            events.Add(new CalendarEventModel(
                Title: string.IsNullOrWhiteSpace(source.Summary) ? "Без названия" : source.Summary.Trim(),
                StartTime: start,
                EndTime: end,
                IsAllDay: source.IsAllDay || !occurrence.Period.StartTime.HasTime,
                Location: string.IsNullOrWhiteSpace(source.Location) ? null : source.Location.Trim(),
                Color: color));

            if (events.Count >= MaxEventsPerSource) break;
        }

        return events;
    }

    /// <summary>Слияние календарей в один список: по началу, в один момент — сначала «весь день», затем по названию.</summary>
    public static List<CalendarEventModel> Merge(IEnumerable<IEnumerable<CalendarEventModel>> sources) =>
        sources.SelectMany(e => e)
            .OrderBy(e => e.StartTime)
            .ThenByDescending(e => e.IsAllDay)
            .ThenBy(e => e.Title, StringComparer.CurrentCulture)
            .ToList();

    internal static DateTimeOffset ToLocal(CalDateTime value, TimeZoneInfo tz)
    {
        if (!value.HasTime) return AtLocal(value.Value.Date, tz); // «весь день»
        if (value.IsFloating) return AtLocal(value.Value, tz); // без пояса — время устройства
        return TimeZoneInfo.ConvertTime(new DateTimeOffset(DateTime.SpecifyKind(value.AsUtc, DateTimeKind.Utc)), tz);
    }

    /// <summary>Местное время без пояса → DateTimeOffset со смещением пояса на эту дату.</summary>
    internal static DateTimeOffset AtLocal(DateTime wallClock, TimeZoneInfo tz)
    {
        var unspecified = DateTime.SpecifyKind(wallClock, DateTimeKind.Unspecified);
        return new DateTimeOffset(unspecified, tz.GetUtcOffset(unspecified));
    }
}
