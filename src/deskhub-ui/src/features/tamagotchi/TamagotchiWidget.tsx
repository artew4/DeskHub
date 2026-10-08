import { Heart } from 'lucide-react'
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useClock } from '../clock/useClock'
import { Cat } from './Cat'
import { STATE_LABELS, roomLayout, type RoomLayout } from './catStates'
import { Room } from './Room'
import { useCatBrain } from './useCatBrain'

const CAT_NAME = 'Мурзик'
// Размер SVG кота и положение точки «лап» внутри него
const CAT_BOX = { width: 96, height: 72, feetX: 48, feetY: 64 }

/**
 * Виртуальный питомец на месте пробок (вне окна Пн–Пт 10:00–13:20).
 * Слои: комната (статичный SVG) → кружка → кот (HTML-слой, движется transform-переходом) → подписи.
 */
export const TamagotchiWidget = memo(function TamagotchiWidget() {
  const containerRef = useRef<HTMLElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  // Комната рисуется 1:1 в пикселях карточки — измеряем до первой отрисовки (без вспышки) и следим за изменением
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => setSize({ width: Math.round(el.clientWidth), height: Math.round(el.clientHeight) })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section ref={containerRef} className="relative h-full overflow-hidden rounded-card bg-surface-1 p-0">
      {/* key: новый размер — новый «мозг» с якорями под эту комнату */}
      {size && <CatRoom key={`${size.width}x${size.height}`} width={size.width} height={size.height} />}
    </section>
  )
})

function CatRoom({ width, height }: { width: number; height: number }) {
  const hour = useClock('minute').getHours()
  const isNight = hour < 7 || hour >= 20
  const layout = useMemo(() => roomLayout(width, height), [width, height])
  const { frame, mugOnShelf, pokedAt, poke } = useCatBrain(isNight, layout)

  const moving = frame.moveMs >= 1000 ? 'ease-in-out' : 'linear' // переходы между зонами — 2 с ease-in-out; «тыгыдык» — рывками
  const catTransform = `translate3d(${frame.x - CAT_BOX.feetX}px, ${frame.y - CAT_BOX.feetY}px, 0)`

  return (
    <div className="absolute inset-0" role="img" aria-label={`${CAT_NAME} ${STATE_LABELS[frame.state]}`}>
      <Room isNight={isNight} layout={layout} />

      <Mug onShelf={mugOnShelf} layout={layout} />

      <div
        className="absolute left-0 top-0 will-change-transform"
        style={{ transform: catTransform, transition: `transform ${frame.moveMs}ms ${moving}` }}
      >
        <button type="button" onClick={poke} className="block cursor-none rounded-full outline-none" aria-label={`Погладить: ${CAT_NAME}`}>
          <Cat pose={frame.pose} facing={frame.facing} />
        </button>
        {pokedAt && (
          <Heart
            key={pokedAt}
            className="pointer-events-none absolute left-1/2 top-0 size-5 -translate-x-1/2 fill-status-bad text-status-bad motion-safe:animate-cat-heart"
            aria-hidden
          />
        )}
      </div>

      {/* Шапка: имя и занятие — как подпись в инди-игре */}
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-label">
        <span className="font-semibold text-fg-primary">{CAT_NAME}</span>
        <span className="text-fg-secondary">{STATE_LABELS[frame.state]}</span>
      </div>
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
