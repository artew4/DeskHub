import { memo } from 'react'
import { AnalogClock } from './AnalogClock'
import { DigitalDate } from './DigitalDate'

/**
 * Ячейка 7×3 (~709×364 px на 1280×800): циферблат слева, цифровое время и дата справа.
 * Контейнер — те же классы, что у остальных виджетов (rounded-card bg-surface-1 p-4).
 */
const DIAL_SIZE = 296

export const ClockWidget = memo(function ClockWidget() {
  return (
    <section
      className="flex h-full items-center gap-12 overflow-hidden rounded-card bg-surface-1 p-4 pl-6"
      aria-label="Часы"
    >
      <AnalogClock size={DIAL_SIZE} />
      <DigitalDate />
    </section>
  )
})
