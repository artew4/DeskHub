import { memo, useMemo } from 'react'
import { useClock } from '../clock/useClock'
import { WEEKDAY_LABELS, buildMonthGrid, formatMonthTitle, type CalendarDay } from './calendar'

/** Календарь текущего месяца. Перестраивается раз в минуту — смена дня и месяца в полночь подхватывается сама. */
export const CalendarWidget = memo(function CalendarWidget() {
  const now = useClock('minute')
  // Сетка зависит только от даты: пересчёт раз в сутки, а не каждую минуту
  const [year, month, date] = [now.getFullYear(), now.getMonth(), now.getDate()]
  const cells = useMemo(() => buildMonthGrid(new Date(year, month, date)), [year, month, date])
  const weekRows = Math.ceil(cells.length / 7)

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-card bg-surface-1 p-4">
      <h2 className="text-xl font-semibold text-fg-primary">{formatMonthTitle(now)}</h2>

      <div className="mt-3 grid grid-cols-7 text-center">
        {WEEKDAY_LABELS.map((label, i) => (
          <span key={label} className={`text-label font-medium ${i >= 5 ? 'text-fg-muted' : 'text-fg-secondary'}`}>
            {label}
          </span>
        ))}
      </div>

      {/* Строки делят оставшуюся высоту поровну — и при 4, и при 6 неделях сетка заполняет карточку */}
      <div className="mt-1.5 grid flex-1 grid-cols-7 place-items-center" style={{ gridTemplateRows: `repeat(${weekRows}, 1fr)` }}>
        {cells.map((cell, i) => (cell ? <DayCell key={i} day={cell} /> : <span key={i} aria-hidden />))}
      </div>
    </section>
  )
})

function DayCell({ day }: { day: CalendarDay }) {
  if (day.isToday) {
    return (
      <span className="flex size-8 items-center justify-center rounded-full bg-fg-primary text-base font-semibold tabular-nums text-surface-1">
        {day.day}
      </span>
    )
  }
  const tone = day.isPast ? 'text-fg-muted' : day.isWeekend ? 'text-fg-secondary' : 'text-fg-primary'
  return <span className={`text-base tabular-nums ${tone}`}>{day.day}</span>
}
