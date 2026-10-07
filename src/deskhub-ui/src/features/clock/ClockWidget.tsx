import { memo } from 'react'
import { AnalogClock } from './AnalogClock'
import { DigitalDate } from './DigitalDate'

/** Ячейка 7×3 (~574×278 px): циферблат слева, цифровое время и дата справа. */
const DIAL_SIZE = 232

export const ClockWidget = memo(function ClockWidget() {
  return (
    <section
      className="flex h-full items-center gap-9 overflow-hidden rounded-card border border-white/10 bg-gradient-to-br from-white/[0.07] via-white/[0.03] to-white/[0.01] px-6"
      aria-label="Часы"
    >
      <AnalogClock size={DIAL_SIZE} />
      <DigitalDate />
    </section>
  )
})
