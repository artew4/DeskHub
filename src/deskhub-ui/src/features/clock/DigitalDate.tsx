import { memo } from 'react'
import { useClock } from './useClock'

// Форматтеры создаются один раз — Intl.DateTimeFormat дорогой
const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false })
const weekdayFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'long' })
const dayMonthFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Цифровое время и дата. Показывает часы и минуты, поэтому ре-рендер — раз в минуту
 * (useClock('minute') выравнивает тик по границе минуты); смена даты в полночь — автоматически.
 */
export const DigitalDate = memo(function DigitalDate() {
  const now = useClock('minute')

  return (
    <div className="flex min-w-0 flex-col">
      <time
        dateTime={now.toISOString()}
        className="text-[88px] font-extralight leading-none tracking-tight tabular-nums text-fg-primary"
      >
        {timeFormat.format(now)}
      </time>

      <div className="mt-5 h-px w-10 bg-white/20" />

      <span className="mt-4 text-label font-medium uppercase tracking-[0.3em] text-fg-secondary">
        {weekdayFormat.format(now)}
      </span>
      <span className="mt-1.5 text-xl font-light tracking-wide text-fg-secondary/80">
        {capitalize(dayMonthFormat.format(now))}
      </span>
    </div>
  )
})
