import { memo } from 'react'
import { AnalogClock } from './AnalogClock'
import { DigitalDate } from './DigitalDate'

/**
 * Ячейка 7×3 (~572×276 px на 1024×600): циферблат слева, цифровое время и дата справа.
 * Контейнер — те же классы, что у остальных виджетов (rounded-card bg-surface-1 p-4).
 */
const DIAL_SIZE = 232

export const ClockWidget = memo(function ClockWidget() {
  return (
    <section
      className="flex h-full items-center gap-9 overflow-hidden rounded-card bg-surface-1 p-4"
      aria-label="Часы"
    >
      <AnalogClock size={DIAL_SIZE} />
      <DigitalDate />
    </section>
  )
})
