import { memo, useEffect, useId, useRef } from 'react'
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

  useEffect(() => {
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
  }, [])

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden>
      <Dial />
      <Hand ref={hourRef}>
        {/* Часовая: широкая, сужается к концу */}
        <path d="M97.4 108 L98.3 52 Q100 48.5 101.7 52 L102.6 108 Z" fill="#ECEEF1" />
      </Hand>
      <Hand ref={minuteRef}>
        <path d="M98.4 110 L99.2 22 Q100 19.5 100.8 22 L101.6 110 Z" fill="#F5F6F8" />
      </Hand>
      <Hand ref={secondRef}>
        {/* Секундная: тонкая серебристая с красным кончиком и противовесом */}
        <line x1="100" y1="122" x2="100" y2="30" stroke="#C9CDD4" strokeWidth="0.8" strokeLinecap="round" />
        <line x1="100" y1="30" x2="100" y2="14" stroke="#E5484D" strokeWidth="1.1" strokeLinecap="round" />
        <circle cx="100" cy="119" r="2.6" fill="#C9CDD4" />
        <circle cx="100" cy="100" r="3.6" fill="#F5F6F8" />
        <circle cx="100" cy="100" r="1.5" fill="#E5484D" />
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

/** Статичный циферблат: тонкое кольцо, 60 минутных делений, 12 часовых. Без цифр. */
const Dial = memo(function Dial() {
  const faceId = useId()
  return (
    <svg viewBox="0 0 200 200" className="absolute inset-0 size-full">
      <defs>
        <radialGradient id={faceId} cx="50%" cy="38%" r="65%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.07" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="100" cy="100" r="97" fill={`url(#${faceId})`} />
      <circle cx="100" cy="100" r="97" fill="none" stroke="#FFFFFF" strokeOpacity="0.16" strokeWidth="0.8" />
      <circle cx="100" cy="100" r="92.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.05" strokeWidth="0.6" />

      {MINUTE_TICKS.map((i) => {
        const isHour = i % 5 === 0
        const isCardinal = i % 15 === 0
        return (
          <line
            key={i}
            x1="100"
            y1={isHour ? 8 : 9.5}
            x2="100"
            y2={isCardinal ? 22 : isHour ? 18 : 13}
            stroke="#FFFFFF"
            strokeOpacity={isHour ? 0.85 : 0.22}
            strokeWidth={isCardinal ? 2.2 : isHour ? 1.6 : 0.6}
            strokeLinecap="round"
            transform={`rotate(${i * 6} 100 100)`}
          />
        )
      })}
    </svg>
  )
})
