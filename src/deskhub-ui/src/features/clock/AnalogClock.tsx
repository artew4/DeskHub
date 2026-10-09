import { memo, useEffect, useRef } from 'react'
import { useDashboardStore } from '../../store/useDashboardStore'
import { handAngles } from './clockMath'

/**
 * Стрелочный циферблат с плавной секундной стрелкой.
 *
 * Производительность (60 FPS на Raspberry Pi):
 * - React рендерит компонент ОДИН раз; стрелки двигает цикл requestAnimationFrame,
 *   который пишет style.transform напрямую в DOM через ref — без setState и ре-рендеров.
 * - Каждая стрелка — отдельный HTML-слой (div + свой SVG) с will-change: transform:
 *   поворот выполняет композитор (GPU), циферблат и стрелки не перерисовываются.
 * - Циферблат (деления) — статичный SVG, отрисовывается один раз.
 * - При prefers-reduced-motion секундная стрелка «тикает» раз в секунду.
 */
export const AnalogClock = memo(function AnalogClock({ size }: { size: number }) {
  const hourRef = useRef<HTMLDivElement>(null)
  const minuteRef = useRef<HTMLDivElement>(null)
  const secondRef = useRef<HTMLDivElement>(null)

  // Экран спит (режим питания sleep) — цикл rAF на паузе, при пробуждении стрелки сразу встают на место
  const asleep = useDashboardStore((s) => s.powerMode === 'sleep')

  useEffect(() => {
    if (asleep) return
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0

    const render = () => {
      const { hour, minute, second } = handAngles(new Date(), smooth)
      if (hourRef.current) hourRef.current.style.transform = `rotate(${hour}deg)`
      if (minuteRef.current) minuteRef.current.style.transform = `rotate(${minute}deg)`
      if (secondRef.current) secondRef.current.style.transform = `rotate(${second}deg)`
      frame = requestAnimationFrame(render)
    }

    render()
    return () => cancelAnimationFrame(frame)
  }, [asleep])

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden>
      <Dial />
      <Hand ref={hourRef}>
        <line x1="100" y1="108" x2="100" y2="52" strokeWidth="5" strokeLinecap="round" className="stroke-fg-primary" />
      </Hand>
      <Hand ref={minuteRef}>
        <line x1="100" y1="110" x2="100" y2="24" strokeWidth="3" strokeLinecap="round" className="stroke-fg-primary" />
      </Hand>
      <Hand ref={secondRef}>
        {/* Секундная — единственный цветной акцент, плоская: линия с коротким хвостом и центральная точка */}
        <line x1="100" y1="118" x2="100" y2="16" strokeWidth="1.2" strokeLinecap="round" className="stroke-status-bad" />
        <circle cx="100" cy="100" r="3.5" className="fill-status-bad" />
      </Hand>
    </div>
  )
})

/** Слой стрелки: занимает весь циферблат, вращается вокруг центра. */
function Hand({ ref, children }: { ref: React.Ref<HTMLDivElement>; children: React.ReactNode }) {
  return (
    <div ref={ref} className="absolute inset-0 will-change-transform">
      <svg viewBox="0 0 200 200" className="size-full overflow-visible">
        {children}
      </svg>
    </div>
  )
}

const MINUTE_TICKS = Array.from({ length: 60 }, (_, i) => i)

/** Статичный плоский циферблат: кольцо-трек, 60 минутных делений, 12 часовых. Без цифр, бликов и градиентов. */
const Dial = memo(function Dial() {
  return (
    <svg viewBox="0 0 200 200" className="absolute inset-0 size-full">
      {/* Кольцо — цвет трека прогресс-баров телеметрии */}
      <circle cx="100" cy="100" r="97" fill="none" strokeWidth="1.5" className="stroke-surface-2" />

      {MINUTE_TICKS.map((i) => {
        const isHour = i % 5 === 0
        return (
          <line
            key={i}
            x1="100"
            y1="9"
            x2="100"
            y2={isHour ? 20 : 13}
            strokeWidth={isHour ? 2 : 1}
            strokeLinecap="round"
            className={isHour ? 'stroke-fg-muted' : 'stroke-fg-muted/40'}
            transform={`rotate(${i * 6} 100 100)`}
          />
        )
      })}
    </svg>
  )
})
