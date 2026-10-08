// Построение сетки месяца — чистые функции на нативном Date, неделя начинается с понедельника.

import type { CalendarEventModel } from '../../types/dashboard'

export interface CalendarDay {
  day: number
  isToday: boolean
  isPast: boolean
  isWeekend: boolean
  /** Цвета календарей с событиями в этот день — уникальные, в порядке первого события, не больше MAX_DAY_DOTS */
  eventColors: string[]
}

/** Больше точек под датой не помещается в колонку 7-дневной сетки. */
export const MAX_DAY_DOTS = 3

/** Ячейка сетки: день месяца или пустая ячейка-отступ перед первым числом. */
export type CalendarCell = CalendarDay | null

export const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

/** getDay(): 0 = воскресенье … 6 = суббота → индекс в неделе с понедельника: 0 = Пн … 6 = Вс. */
export const mondayIndex = (date: Date): number => (date.getDay() + 6) % 7

/** dayColors — для номера дня месяца цвета календарей, у которых в этот день есть события. */
export function buildMonthGrid(today: Date, dayColors: ReadonlyMap<number, string[]> = new Map()): CalendarCell[] {
  const year = today.getFullYear()
  const month = today.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate() // 0-й день следующего месяца = последний день текущего
  const leading = mondayIndex(new Date(year, month, 1))

  const cells: CalendarCell[] = Array.from({ length: leading }, () => null)
  for (let day = 1; day <= daysInMonth; day++) {
    const weekday = (leading + day - 1) % 7
    cells.push({
      day,
      isToday: day === today.getDate(),
      isPast: day < today.getDate(),
      isWeekend: weekday >= 5,
      eventColors: (dayColors.get(day) ?? []).slice(0, MAX_DAY_DOTS),
    })
  }
  return cells
}

const monthFormat = new Intl.DateTimeFormat('ru-RU', { month: 'long' })

/** «Октябрь 2026» (именительный падеж — standalone-форма Intl). */
export function formatMonthTitle(date: Date): string {
  const month = monthFormat.format(date)
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${date.getFullYear()}`
}

// ─── События ────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000

/** Локальная полночь дня, смещённого на offset дней. */
export function startOfDay(date: Date, offset = 0): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset)
}

/** Событие пересекается с [from; to) — так попадают и многодневные, и идущие через полночь. */
export const overlaps = (e: CalendarEventModel, from: Date, to: Date): boolean =>
  Date.parse(e.endTime) > from.getTime() && Date.parse(e.startTime) < to.getTime()

export function eventsOnDay(events: CalendarEventModel[], day: Date): CalendarEventModel[] {
  const from = startOfDay(day)
  return events.filter((e) => overlaps(e, from, startOfDay(day, 1)))
}

/**
 * Для каждого дня месяца `monthOf` — цвета календарей, у которых в этот день есть события
 * (уникальные, в порядке появления: события отсортированы по началу).
 */
export function dayEventColors(events: CalendarEventModel[], monthOf: Date): Map<number, string[]> {
  const year = monthOf.getFullYear()
  const month = monthOf.getMonth()
  const monthStart = new Date(year, month, 1).getTime()
  const monthEnd = new Date(year, month + 1, 1).getTime()
  const days = new Map<number, string[]>()
  const mark = (t: number, color: string) => {
    const day = new Date(t).getDate()
    const colors = days.get(day) ?? []
    if (!colors.includes(color)) colors.push(color)
    days.set(day, colors)
  }
  for (const e of events) {
    const start = Math.max(Date.parse(e.startTime), monthStart)
    const end = Math.min(Date.parse(e.endTime), monthEnd)
    // Обходим дни события; конец не включительно (событие «весь день» 8-го заканчивается в 00:00 9-го)
    for (let t = start; t < end; t = startOfDay(new Date(t), 1).getTime()) mark(t, e.color)
    if (end === start && start >= monthStart && start < monthEnd) mark(start, e.color) // нулевая длительность
  }
  return days
}

const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false })

export interface EventTimeLabel {
  /** Верхняя строка левой колонки: «10:15», «весь день», «с 22:00» */
  start: string
  /** Нижняя строка: «10:30», «до 12:00» или пусто */
  end: string
}

/** Подпись времени события в контексте конкретного дня. */
export function eventTimeLabel(e: CalendarEventModel, day: Date): EventTimeLabel {
  if (e.isAllDay) return { start: 'весь', end: 'день' }
  const from = startOfDay(day).getTime()
  const to = from + DAY_MS
  const start = Date.parse(e.startTime)
  const end = Date.parse(e.endTime)
  const startsBefore = start < from
  const endsAfter = end > to
  if (startsBefore && endsAfter) return { start: 'весь', end: 'день' }
  if (startsBefore) return { start: 'до', end: timeFormat.format(end) }
  if (endsAfter) return { start: timeFormat.format(start), end: '→' }
  return { start: timeFormat.format(start), end: end > start ? timeFormat.format(end) : '' }
}

export type EventPhase = 'past' | 'now' | 'upcoming'

/** «Идёт сейчас» — только для событий со временем; «весь день» не подсвечивается весь день. */
export function eventPhase(e: CalendarEventModel, now: Date): EventPhase {
  const t = now.getTime()
  if (e.isAllDay) return Date.parse(e.endTime) <= t ? 'past' : 'upcoming'
  if (Date.parse(e.endTime) <= t) return 'past'
  return Date.parse(e.startTime) <= t ? 'now' : 'upcoming'
}
