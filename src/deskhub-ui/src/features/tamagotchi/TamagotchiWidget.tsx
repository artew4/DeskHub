import { Heart } from 'lucide-react'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useDashboardStore } from '../../store/useDashboardStore'
import { useClock } from '../clock/useClock'
import { Cat } from './Cat'
import { STATE_LABELS, roomLayout, type CatReactionKind, type RoomLayout } from './catStates'
import { Room, RoomFront } from './Room'
import { RoomLighting, WindowWeather } from './RoomAtmosphere'
import { hasPrecipitation, roomPhase, skyFromWeatherIcon } from './roomEnvironment'
import { YARN_RADIUS, useCatBrain, type YarnState } from './useCatBrain'

const CAT_NAME = 'Мурзик'

/** Спокойный шаг — мягкий ease-in-out (длительность 2.2–5 с по расстоянию, ≈ 3 с через комнату); бег и прыжки — линейно. */
const WALK_EASING = 'cubic-bezier(0.45, 0, 0.55, 1)'
// Размер SVG кота и положение точки «лап» внутри него
const CAT_BOX = { width: 96, height: 72, feetX: 48, feetY: 64 }

/**
 * Виртуальный питомец на месте пробок (вне окна Пн–Пт 10:00–13:20). Без подписей — только комната и кот.
 * Слои: комната (статичный SVG) → кружка → клубок → кот (HTML-слой, движется transform-переходом).
 */
export const TamagotchiWidget = memo(function TamagotchiWidget() {
  const containerRef = useRef<HTMLElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  // Комната рисуется 1:1 в пикселях карточки — измеряем до первой отрисовки (без вспышки) и следим за изменением
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      // Скрытый экран (display: none в режиме sleep) даёт 0×0 — не пересоздавать комнату и «мозг» кота
      if (el.clientWidth === 0 || el.clientHeight === 0) return
      setSize({ width: Math.round(el.clientWidth), height: Math.round(el.clientHeight) })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    // theme-locked — исходная тёмная палитра: темы по времени суток кота не касаются
    <section ref={containerRef} className="theme-locked relative h-full overflow-hidden rounded-card bg-surface-1 p-0">
      {/* key: новый размер — новый «мозг» с якорями под эту комнату */}
      {size && <CatRoom key={`${size.width}x${size.height}`} width={size.width} height={size.height} />}
    </section>
  )
})

function CatRoom({ width, height }: { width: number; height: number }) {
  const hour = useClock('minute').getHours()
  // Реальный мир за окном: фаза суток комнаты и погода из стора (wttr.in → WeatherModel.icon)
  const phase = roomPhase(hour)
  const sky = skyFromWeatherIcon(useDashboardStore((s) => s.weather?.icon))
  const precipitation = hasPrecipitation(sky)
  const env = useMemo(() => ({ phase, precipitation }), [phase, precipitation])
  const layout = useMemo(() => roomLayout(width, height), [width, height])
  const { frame, mugOnShelf, yarn, reaction, poke, startle } = useCatBrain(env, layout)

  // Испуг: экран резко включили ночью (sleep → dimmed — касание чёрного экрана). Пока экран спал,
  // виджет скрыт (display: none), но смонтирован — «мозг» жив и реагирует мгновенно при включении.
  const powerMode = useDashboardStore((s) => s.powerMode)
  const prevPowerMode = useRef(powerMode)
  useEffect(() => {
    if (prevPowerMode.current === 'sleep' && powerMode === 'dimmed') startle()
    prevPowerMode.current = powerMode
  }, [powerMode, startle])

  const easing = frame.pose === 'run' ? 'linear' : WALK_EASING
  const catTransform = `translate3d(${frame.x - CAT_BOX.feetX}px, ${frame.y - CAT_BOX.feetY}px, 0)`

  return (
    // Вся карточка — зона касания (кот маленький, а пальцем по нему попасть трудно); свайп мини-карусели клик не порождает
    <div className="absolute inset-0" role="button" aria-label={`${CAT_NAME} ${STATE_LABELS[frame.state]}. Коснитесь, чтобы погладить`} onClick={poke}>
      <Room phase={phase} sky={sky} layout={layout} />
      <WindowWeather phase={phase} sky={sky} layout={layout} />
      <RoomFront layout={layout} />

      <Mug onShelf={mugOnShelf} layout={layout} />
      <Yarn yarn={yarn} />
      {/* Освещение — поверх комнаты, кружки и клубка, но под котом: ночью комната тёмная, кот читается */}
      <RoomLighting phase={phase} sky={sky} layout={layout} />

      <div
        className="absolute left-0 top-0 will-change-transform"
        style={{ transform: catTransform, transition: `transform ${frame.moveMs}ms ${easing}` }}
      >
        <Cat pose={frame.pose} facing={frame.facing} glow={phase === 'night'} />
        {reaction && <ReactionBubble key={reaction.at} kind={reaction.kind} />}
      </div>

    </div>
  )
}

/** Всплывающая реакция над котом: сердечки, значок раздражения или «!» испуга. */
function ReactionBubble({ kind }: { kind: CatReactionKind }) {
  if (kind === 'hearts') {
    // Три сердечка веером, с задержкой — «пыхнули» от кота
    return (
      <>
        {[
          { x: -16, delay: 0, size: 'size-4' },
          { x: 0, delay: 0.15, size: 'size-5' },
          { x: 16, delay: 0.3, size: 'size-4' },
        ].map(({ x, delay, size }) => (
          <Heart
            key={x}
            className={`pointer-events-none absolute left-1/2 top-0 ${size} fill-status-bad text-status-bad opacity-0 motion-safe:animate-cat-heart`}
            style={{ marginLeft: x, animationDelay: `${delay}s` }}
            aria-hidden
          />
        ))}
      </>
    )
  }
  if (kind === 'grumpy') {
    // «Вена раздражения» — как в аниме: недоволен, что разбудили
    return (
      <svg width={20} height={20} viewBox="-10 -10 20 20" className="pointer-events-none absolute right-2 top-0 motion-safe:animate-cat-pop" aria-hidden>
        <path d="M-7,-2 Q-2,-2 -2,-7 M2,-7 Q2,-2 7,-2 M7,2 Q2,2 2,7 M-2,7 Q-2,2 -7,2" fill="none" stroke="#EF4444" strokeWidth={2.6} strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <span className="pointer-events-none absolute left-1/2 -top-3 -translate-x-1/2 text-2xl font-black leading-none text-status-warn motion-safe:animate-cat-pop" aria-hidden>
      !
    </span>
  )
}

/** Клубок ниток на полу: при пинке катится (смещение + поворот на путь/радиус), с мягким замедлением. */
function Yarn({ yarn }: { yarn: YarnState }) {
  const r = YARN_RADIUS
  return (
    <div
      className="absolute left-0 top-0"
      style={{
        transform: `translate3d(${yarn.x - r}px, ${yarn.y - 2 * r}px, 0)`,
        transition: 'transform 900ms cubic-bezier(0.2, 0.8, 0.3, 1)',
      }}
      aria-hidden
    >
      <svg width={2 * r} height={2 * r} viewBox={`${-r} ${-r} ${2 * r} ${2 * r}`} className="overflow-visible">
        <g style={{ transform: `rotate(${yarn.angle}deg)`, transition: 'transform 900ms cubic-bezier(0.2, 0.8, 0.3, 1)' }}>
          <circle r={r} fill="#C8577E" />
          <path d={`M${-r + 2},-2 q${r - 2},-6 ${2 * r - 4},0 M${-r + 2},3 q${r - 2},-6 ${2 * r - 4},0 M-3,${-r + 1} q-5,${r - 1} 0,${2 * r - 2}`} fill="none" stroke="#E98BAE" strokeWidth={1.2} strokeLinecap="round" />
          {/* Свободный кончик нитки */}
          <path d={`M${r - 2},4 q6,4 12,2`} fill="none" stroke="#C8577E" strokeWidth={1.2} strokeLinecap="round" />
        </g>
      </svg>
    </div>
  )
}

/** Кружка на полке; при KNOCKING_ITEM падает на пол (ускоряющийся переход, как под действием тяжести). */
function Mug({ onShelf, layout }: { onShelf: boolean; layout: RoomLayout }) {
  const at = onShelf ? layout.anchors.mugOnShelf : layout.anchors.mugOnFloor
  return (
    <div
      className="absolute left-0 top-0"
      style={{
        transform: `translate3d(${at.x - 8}px, ${at.y - 16}px, 0) rotate(${onShelf ? 0 : 100}deg)`,
        transformOrigin: '8px 16px',
        // Падение анимируется; возврат на полку (хозяин убрал) — мгновенно, пока кот спит
        transition: onShelf ? 'none' : 'transform 650ms cubic-bezier(0.55, 0, 0.9, 0.45)',
      }}
      aria-hidden
    >
      <svg width={22} height={26} viewBox="0 -10 22 26" className="overflow-visible">
        {onShelf && (
          <path d="M5,-2 q-2,-3 0,-6 M10,-2 q-2,-3 0,-6" fill="none" stroke="#F2F4F7" strokeOpacity={0.35} strokeWidth={1.2} strokeLinecap="round" className="motion-safe:animate-steam" />
        )}
        <path d="M14,5 h3 a3,3 0 0 1 0,6 h-3" fill="none" stroke="#E5484D" strokeWidth={2} />
        <rect x={0} y={2} width={15} height={14} rx={3} fill="#E5484D" />
        <rect x={0} y={2} width={15} height={3} rx={1.5} fill="#F2F4F7" opacity={0.25} />
      </svg>
    </div>
  )
}
