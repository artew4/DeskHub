import { CalendarCheck, CalendarOff, MapPin } from 'lucide-react'
import { memo, useMemo } from 'react'
import { useDashboardStore } from '../../store/useDashboardStore'
import type { CalendarEventModel } from '../../types/dashboard'
import { useClock } from '../clock/useClock'
import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  daysWithEvents,
  eventPhase,
  eventTimeLabel,
  eventsOnDay,
  formatMonthTitle,
  startOfDay,
  type CalendarDay,
} from './calendar'

/** Карточек повестки максимум — больше не помещается без скролла (ячейка 5×3 ≈ 499×364). */
const MAX_AGENDA_CARDS = 5
const MAX_TODAY_CARDS = 4

/**
 * Органайзер: слева — сетка месяца с точками под днями, где есть события; справа — повестка на сегодня и завтра.
 * События — из iCloud через бэкенд (CalendarUpdated / snapshot). Пересчёт раз в минуту (идущее событие, смена дня).
 */
export const CalendarWidget = memo(function CalendarWidget() {
  const now = useClock('minute')
  const calendar = useDashboardStore((s) => s.calendar)
  const events = calendar?.events

  const [year, month, date] = [now.getFullYear(), now.getMonth(), now.getDate()]
  const cells = useMemo(() => {
    const today = new Date(year, month, date)
    return buildMonthGrid(today, daysWithEvents(events ?? [], today))
  }, [year, month, date, events])
  const weekRows = Math.ceil(cells.length / 7)

  return (
    <section className="flex h-full gap-5 overflow-hidden rounded-card bg-surface-1 p-4">
      {/* Сетка месяца */}
      <div className="flex w-[46%] shrink-0 flex-col">
        <h2 className="text-lg font-semibold text-fg-primary">{formatMonthTitle(now)}</h2>
        <div className="mt-3 grid grid-cols-7 text-center">
          {WEEKDAY_LABELS.map((label, i) => (
            <span key={label} className={`text-[12px] font-medium ${i >= 5 ? 'text-fg-muted' : 'text-fg-secondary'}`}>
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
    <span className="flex flex-col items-center gap-0.5">
      <span className={`flex size-7 items-center justify-center rounded-full text-[14px] tabular-nums ${tone}`}>{day.day}</span>
      {/* Точка-индикатор событий; место резервируется всегда, чтобы цифры стояли ровно */}
      <span className={`size-1 rounded-full ${day.hasEvents ? (day.isPast ? 'bg-fg-muted' : 'bg-status-info') : 'bg-transparent'}`} />
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
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <CalendarCheck className="size-10 text-fg-muted" strokeWidth={1.5} aria-hidden />
        <div>
          <p className="text-base font-medium text-fg-secondary">На сегодня нет планов</p>
          <p className="mt-1 text-[13px] text-fg-muted">Завтра тоже свободно</p>
        </div>
      </div>
    )
  }

  // Сегодня — до 4 карточек, завтра — оставшиеся места (минимум одна, если есть события)
  const todayShown = Math.min(todayEvents.length, tomorrowEvents.length > 0 ? MAX_TODAY_CARDS : MAX_AGENDA_CARDS)
  const tomorrowShown = Math.min(tomorrowEvents.length, Math.max(1, MAX_AGENDA_CARDS - todayShown))

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <AgendaDay title="Сегодня" day={today} events={todayEvents} shown={todayShown} now={now} emptyText="На сегодня нет планов" />
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
      <h3 className="mb-1.5 flex items-baseline justify-between text-label font-semibold uppercase text-fg-secondary">
        {title}
        {events.length > 0 && <span className="text-[12px] font-normal normal-case tabular-nums text-fg-muted">{events.length}</span>}
      </h3>
      {events.length === 0 && emptyText ? (
        <p className="flex items-center gap-2 py-1 text-[13px] text-fg-muted">
          <CalendarCheck className="size-4" aria-hidden />
          {emptyText}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {events.slice(0, shown).map((event) => (
            <EventCard key={`${event.title}-${event.startTime}`} event={event} day={day} now={now} />
          ))}
          {hidden > 0 && <li className="pl-3 text-[12px] text-fg-muted">ещё {hidden}</li>}
        </ul>
      )}
    </section>
  )
}

/** Карточка события: акцентная линия слева (идёт сейчас — зелёная, весь день — приглушённая), время колонкой, название и место. */
function EventCard({ event, day, now }: { event: CalendarEventModel; day: Date; now: Date }) {
  const phase = eventPhase(event, now)
  const time = eventTimeLabel(event, day)
  const accent = phase === 'now' ? 'border-status-ok' : event.isAllDay ? 'border-fg-muted' : 'border-status-info'

  return (
    <li className={`flex min-w-0 gap-2.5 rounded-r-md border-l-[3px] bg-surface-2/60 py-1 pl-2.5 pr-2 ${accent} ${phase === 'past' ? 'opacity-45' : ''}`}>
      <span className="flex w-10 shrink-0 flex-col text-[12px] leading-[17px] tabular-nums text-fg-secondary">
        <span className={phase === 'now' ? 'font-semibold text-status-ok' : ''}>{time.start}</span>
        <span className="text-fg-muted">{time.end}</span>
      </span>
      <span className="flex min-w-0 flex-col justify-center">
        <span className="truncate text-[14px] font-medium leading-[17px] text-fg-primary">{event.title}</span>
        {event.location && (
          <span className="flex min-w-0 items-center gap-1 text-[12px] leading-[17px] text-fg-muted">
            <MapPin className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{event.location}</span>
          </span>
        )}
      </span>
    </li>
  )
}

function NotConnected() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <CalendarOff className="size-9 text-fg-muted" strokeWidth={1.5} aria-hidden />
      <div>
        <p className="text-base font-medium text-fg-secondary">Календарь не подключён</p>
        <p className="mt-1 text-[12px] text-fg-muted">Ссылка iCloud — Calendar__WebcalUrl в .env</p>
      </div>
    </div>
  )
}
