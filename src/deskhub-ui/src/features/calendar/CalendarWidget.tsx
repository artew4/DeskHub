import { CalendarCheck, CalendarOff, MapPin } from 'lucide-react'
import { memo, useMemo } from 'react'
import { useDashboardStore } from '../../store/useDashboardStore'
import type { CalendarEventModel } from '../../types/dashboard'
import { useClock } from '../clock/useClock'
import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  dayEventColors,
  eventPhase,
  eventTimeLabel,
  eventsOnDay,
  formatMonthTitle,
  startOfDay,
  type CalendarDay,
} from './calendar'

/** Ячейка 5×3 на 1024×600 ≈ 404×276 (внутри 372×244): в повестку без скролла помещается 4 карточки. */
const MAX_AGENDA_CARDS = 4
const MAX_TODAY_CARDS = 3

/**
 * Органайзер в стиле iOS: слева — сетка месяца с цветными точками календарей под датами,
 * справа — повестка на сегодня и завтра; цвет события = цвет его календаря (iCloud, Outlook…).
 */
export const CalendarWidget = memo(function CalendarWidget() {
  const now = useClock('minute')
  const calendar = useDashboardStore((s) => s.calendar)
  const events = calendar?.events

  const [year, month, date] = [now.getFullYear(), now.getMonth(), now.getDate()]
  const cells = useMemo(() => {
    const today = new Date(year, month, date)
    return buildMonthGrid(today, dayEventColors(events ?? [], today))
  }, [year, month, date, events])
  const weekRows = Math.ceil(cells.length / 7)

  return (
    <section className="flex h-full gap-3 overflow-hidden rounded-card bg-surface-1 p-4">
      {/* Сетка месяца */}
      <div className="flex w-[45%] shrink-0 flex-col">
        <h2 className="text-[15px] font-semibold leading-5 text-fg-primary">{formatMonthTitle(now)}</h2>
        <div className="mt-2 grid grid-cols-7 text-center">
          {WEEKDAY_LABELS.map((label, i) => (
            <span key={label} className={`text-[11px] font-medium ${i >= 5 ? 'text-fg-muted' : 'text-fg-secondary'}`}>
              {label}
            </span>
          ))}
        </div>
        <div className="mt-1 grid flex-1 grid-cols-7 place-items-center" style={{ gridTemplateRows: `repeat(${weekRows}, 1fr)` }}>
          {cells.map((cell, i) => (cell ? <DayCell key={i} day={cell} /> : <span key={i} aria-hidden />))}
        </div>
      </div>

      <div className="w-px shrink-0 bg-surface-2" aria-hidden />

      {/* Повестка */}
      <div className="flex min-w-0 flex-1 flex-col">
        {calendar ? <Agenda events={calendar.events} now={now} /> : <NotConnected />}
      </div>
    </section>
  )
})

function DayCell({ day }: { day: CalendarDay }) {
  const tone = day.isToday
    ? 'bg-fg-primary font-semibold text-surface-1'
    : day.isPast
      ? 'text-fg-muted'
      : day.isWeekend
        ? 'text-fg-secondary'
        : 'text-fg-primary'
  return (
    <span className="flex flex-col items-center gap-[3px]">
      <span className={`flex size-6 items-center justify-center rounded-full text-[13px] tabular-nums ${tone}`}>{day.day}</span>
      {/* Точки календарей (до 3); строка высотой 3 px есть всегда — цифры не прыгают */}
      <span className={`flex h-[3px] gap-[2px] ${day.isPast ? 'opacity-50' : ''}`}>
        {day.eventColors.map((color) => (
          <span key={color} className="size-[3px] rounded-full" style={{ backgroundColor: color }} />
        ))}
      </span>
    </span>
  )
}

function Agenda({ events, now }: { events: CalendarEventModel[]; now: Date }) {
  const today = startOfDay(now)
  const tomorrow = startOfDay(now, 1)
  const todayEvents = eventsOnDay(events, today)
  const tomorrowEvents = eventsOnDay(events, tomorrow)

  if (todayEvents.length === 0 && tomorrowEvents.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2.5 text-center">
        <CalendarCheck className="size-8 text-fg-muted" strokeWidth={1.5} aria-hidden />
        <div>
          <p className="text-[14px] font-medium text-fg-secondary">На сегодня нет планов</p>
          <p className="mt-0.5 text-[12px] text-fg-muted">Завтра тоже свободно</p>
        </div>
      </div>
    )
  }

  // Сегодня — до 3 карточек, завтра — оставшиеся места (минимум одна, если есть события)
  const todayShown = Math.min(todayEvents.length, tomorrowEvents.length > 0 ? MAX_TODAY_CARDS : MAX_AGENDA_CARDS)
  const tomorrowShown = Math.min(tomorrowEvents.length, Math.max(1, MAX_AGENDA_CARDS - todayShown))

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <AgendaDay title="Сегодня" day={today} events={todayEvents} shown={todayShown} now={now} emptyText="Нет планов" />
      {tomorrowEvents.length > 0 && <AgendaDay title="Завтра" day={tomorrow} events={tomorrowEvents} shown={tomorrowShown} now={now} />}
    </div>
  )
}

interface AgendaDayProps {
  title: string
  day: Date
  events: CalendarEventModel[]
  shown: number
  now: Date
  emptyText?: string
}

function AgendaDay({ title, day, events, shown, now, emptyText }: AgendaDayProps) {
  const hidden = events.length - shown
  return (
    <section>
      <h3 className="mb-1 flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-wide text-fg-secondary">
        {title}
        {events.length > 0 && <span className="font-normal tabular-nums text-fg-muted">{events.length}</span>}
      </h3>
      {events.length === 0 && emptyText ? (
        <p className="flex items-center gap-1.5 text-[12px] text-fg-muted">
          <CalendarCheck className="size-3.5" aria-hidden />
          {emptyText}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {events.slice(0, shown).map((event) => (
            <EventCard key={`${event.color}-${event.title}-${event.startTime}`} event={event} day={day} now={now} />
          ))}
          {hidden > 0 && <li className="pl-2 text-[11px] leading-[14px] text-fg-muted">ещё {hidden}</li>}
        </ul>
      )}
    </section>
  )
}

/**
 * Карточка события: левая граница 4 px в цвет календаря (как в iOS), время колонкой, название и место.
 * Идущее сейчас — фон ярче и время в цвете календаря; прошедшее — приглушено.
 */
function EventCard({ event, day, now }: { event: CalendarEventModel; day: Date; now: Date }) {
  const phase = eventPhase(event, now)
  const time = eventTimeLabel(event, day)

  return (
    <li
      className={`flex min-w-0 gap-2 rounded-r-md border-l-4 py-[3px] pl-2 pr-1.5 ${phase === 'now' ? 'bg-surface-2' : 'bg-surface-2/50'} ${phase === 'past' ? 'opacity-45' : ''}`}
      style={{ borderLeftColor: event.color }}
    >
      <span className="flex w-[34px] shrink-0 flex-col text-[11px] leading-[14px] tabular-nums text-fg-secondary">
        <span className={phase === 'now' ? 'font-semibold' : ''} style={phase === 'now' ? { color: event.color } : undefined}>
          {time.start}
        </span>
        <span className="text-fg-muted">{time.end}</span>
      </span>
      <span className="flex min-w-0 flex-col justify-center">
        <span className="truncate text-[13px] font-medium leading-[15px] text-fg-primary">{event.title}</span>
        {event.location && (
          <span className="flex min-w-0 items-center gap-0.5 text-[11px] leading-[13px] text-fg-muted">
            <MapPin className="size-2.5 shrink-0" aria-hidden />
            <span className="truncate">{event.location}</span>
          </span>
        )}
      </span>
    </li>
  )
}

function NotConnected() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2.5 text-center">
      <CalendarOff className="size-8 text-fg-muted" strokeWidth={1.5} aria-hidden />
      <div>
        <p className="text-[14px] font-medium text-fg-secondary">Календарь не подключён</p>
        <p className="mt-0.5 text-[11px] text-fg-muted">Calendar__Sources в .env</p>
      </div>
    </div>
  )
}
