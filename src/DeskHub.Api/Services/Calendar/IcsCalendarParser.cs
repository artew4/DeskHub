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
public static class IcsCalendarParser
{
    /// <summary>Запас назад при поиске: многодневное событие могло начаться раньше диапазона.</summary>
    private static readonly TimeSpan LookBehind = TimeSpan.FromDays(31);
    private const int MaxEvents = 300;

    public static CalendarModel Parse(Stream ics, DateTimeOffset now, TimeZoneInfo tz, int daysAhead)
    {
        var calendar = IcalCalendar.Load(ics) ?? throw new InvalidDataException("Empty iCalendar");

        var localNow = TimeZoneInfo.ConvertTime(now, tz);
        var today = localNow.Date;
        var rangeStart = AtLocal(today, tz);
        var firstOfNextMonth = new DateTime(today.Year, today.Month, 1).AddMonths(1);
        var rangeEnd = AtLocal(Max(today.AddDays(daysAhead + 1), firstOfNextMonth), tz);

        var searchFrom = new CalDateTime(today - LookBehind, tz.Id, hasTime: true);
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
                Location: string.IsNullOrWhiteSpace(source.Location) ? null : source.Location.Trim()));

            if (events.Count >= MaxEvents) break;
        }

        var ordered = events
            .OrderBy(e => e.StartTime)
            .ThenByDescending(e => e.IsAllDay)
            .ThenBy(e => e.Title, StringComparer.CurrentCulture)
            .ToList();

        return new CalendarModel(ordered, rangeStart, rangeEnd, now);
    }

    internal static DateTimeOffset ToLocal(CalDateTime value, TimeZoneInfo tz)
    {
        if (!value.HasTime) return AtLocal(value.Value.Date, tz); // «весь день»
        if (value.IsFloating) return AtLocal(value.Value, tz); // без пояса — время устройства
        return TimeZoneInfo.ConvertTime(new DateTimeOffset(DateTime.SpecifyKind(value.AsUtc, DateTimeKind.Utc)), tz);
    }

    /// <summary>Местное время без пояса → DateTimeOffset со смещением пояса на эту дату.</summary>
    private static DateTimeOffset AtLocal(DateTime wallClock, TimeZoneInfo tz)
    {
        var unspecified = DateTime.SpecifyKind(wallClock, DateTimeKind.Unspecified);
        return new DateTimeOffset(unspecified, tz.GetUtcOffset(unspecified));
    }

    private static DateTime Max(DateTime a, DateTime b) => a > b ? a : b;
}
