namespace DeskHub.Api.Models;

/// <summary>Событие календаря (одно вхождение — повторяющиеся события уже развёрнуты).</summary>
/// <param name="Title">Название (SUMMARY).</param>
/// <param name="StartTime">Начало в часовом поясе устройства; для событий «весь день» — полночь даты начала.</param>
/// <param name="EndTime">Конец (не включительно); для «весь день» — полночь дня после последнего.</param>
/// <param name="IsAllDay">Событие на весь день (DTSTART;VALUE=DATE).</param>
/// <param name="Location">Место (LOCATION), если указано.</param>
/// <param name="Color">Цвет календаря-источника (#RRGGBB) — точка в сетке и полоса карточки.</param>
public sealed record CalendarEventModel(
    string Title,
    DateTimeOffset StartTime,
    DateTimeOffset EndTime,
    bool IsAllDay,
    string? Location,
    string Color);

/// <summary>События всех календарей (iCloud, Outlook, …) за диапазон [RangeStart; RangeEnd), одним списком.</summary>
/// <param name="Events">События, отсортированные по началу (в один момент — сначала «весь день»).</param>
/// <param name="RangeStart">Начало диапазона: сегодня 00:00.</param>
/// <param name="RangeEnd">Конец диапазона: позднее из «+8 дней» и «1-е число следующего месяца».</param>
/// <param name="UpdatedAt">Когда бэкенд получил данные (UTC).</param>
public sealed record CalendarModel(
    IReadOnlyList<CalendarEventModel> Events,
    DateTimeOffset RangeStart,
    DateTimeOffset RangeEnd,
    DateTimeOffset UpdatedAt);
