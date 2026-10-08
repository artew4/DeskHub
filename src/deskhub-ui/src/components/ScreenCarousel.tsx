import { Children, useEffect, useRef, type PointerEvent, type ReactNode } from 'react'
import { SCREEN_COUNT, useDashboardStore } from '../store/useDashboardStore'

/** Минимальная длина свайпа для смены экрана. */
const SWIPE_THRESHOLD_PX = 100
/** Быстрый короткий флик тоже переключает: скорость ≥ 0.5 px/мс при смещении ≥ 40 px. */
const FLICK_VELOCITY = 0.5
const FLICK_MIN_PX = 40
/** Сдвиг, после которого жест считается горизонтальным перетаскиванием (а не тапом). */
const DRAG_START_PX = 10
/** Сопротивление на краях (некуда листать): палец двигает трек в 3 раза медленнее. */
const EDGE_RESISTANCE = 1 / 3

const TRANSITION = 'transform 500ms cubic-bezier(0.2, 0.8, 0.2, 1)' // ease-kiosk

interface Gesture {
  pointerId: number
  startX: number
  startY: number
  startTime: number
  dx: number
  dragging: boolean
}

/**
 * Горизонтальная карусель экранов 1280×800.
 *
 * - Трек — flex-ряд экранов шириной 100 % каждый; активный экран выбирается translateX(-index × 100 %).
 * - Во время свайпа трек следует за пальцем: transform пишется напрямую в DOM через ref,
 *   без setState на каждое pointermove (60 FPS без ре-рендеров React). После отпускания —
 *   CSS-переход 500 мс к целевому экрану (или обратно, если свайп короткий).
 * - Pointer Events — одна модель для тача на Pi и мыши при разработке.
 *   touch-action: none — иначе Chromium сам заберёт горизонтальный жест и пришлёт pointercancel.
 * - Любое касание (pointerdown, фаза capture) сбрасывает таймер автовозврата на главный экран.
 */
export function ScreenCarousel({ children }: { children: ReactNode }) {
  const activeIndex = useDashboardStore((s) => s.activeScreenIndex)
  const trackRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const screens = Children.toArray(children)

  const applyTransform = (index: number, offsetPx = 0, animate = true) => {
    const track = trackRef.current
    if (!track) return
    track.style.transition = animate ? TRANSITION : 'none'
    track.style.transform = `translate3d(calc(${-index * 100}% + ${offsetPx}px), 0, 0)`
  }

  // Смена экрана из стора (свайп, автовозврат) — плавный переход
  useEffect(() => applyTransform(activeIndex), [activeIndex])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (gesture.current) return // второй палец игнорируем
    gesture.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTime: e.timeStamp,
      dx: 0,
      dragging: false,
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || g.pointerId !== e.pointerId) return
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY

    if (!g.dragging) {
      if (Math.abs(dx) < DRAG_START_PX || Math.abs(dx) < Math.abs(dy)) return
      g.dragging = true
      // Захват — только когда жест точно горизонтальный, чтобы тапы по виджетам работали как обычно
      e.currentTarget.setPointerCapture(e.pointerId)
    }

    const atEdge = (dx > 0 && activeIndex === 0) || (dx < 0 && activeIndex === SCREEN_COUNT - 1)
    g.dx = atEdge ? dx * EDGE_RESISTANCE : dx
    applyTransform(activeIndex, g.dx, false)
  }

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || g.pointerId !== e.pointerId) return
    gesture.current = null
    if (!g.dragging) return

    const rawDx = e.clientX - g.startX
    const velocity = Math.abs(rawDx) / Math.max(1, e.timeStamp - g.startTime)
    const passed = Math.abs(rawDx) > SWIPE_THRESHOLD_PX || (velocity >= FLICK_VELOCITY && Math.abs(rawDx) >= FLICK_MIN_PX)
    const target = passed && e.type === 'pointerup' ? activeIndex + (rawDx < 0 ? 1 : -1) : activeIndex
    const clamped = Math.min(SCREEN_COUNT - 1, Math.max(0, target))

    if (clamped === activeIndex) {
      applyTransform(activeIndex) // короткий свайп или край — пружиним обратно
      useDashboardStore.getState().registerActivity()
    } else {
      useDashboardStore.getState().setScreen(clamped) // эффект выше запустит переход
    }
  }

  return (
    <div
      className="relative h-full w-full touch-none overflow-hidden"
      onPointerDownCapture={() => useDashboardStore.getState().registerActivity()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div ref={trackRef} className="flex h-full w-full will-change-transform">
        {screens.map((screen, index) => (
          // Невидимый экран не получает фокус и не читается скринридером
          <div key={index} className="h-full w-full shrink-0" inert={index !== activeIndex} aria-hidden={index !== activeIndex}>
            {screen}
          </div>
        ))}
      </div>

      <PageDots count={screens.length} active={activeIndex} />
    </div>
  )
}

/** Индикатор экранов — в нижнем отступе (24 px), не перекрывает виджеты. */
function PageDots({ count, active }: { count: number; active: number }) {
  return (
    <div className="pointer-events-none absolute bottom-[9px] left-1/2 flex -translate-x-1/2 gap-1.5" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={`size-1.5 rounded-full transition-colors duration-500 ${i === active ? 'bg-fg-secondary' : 'bg-surface-2'}`}
        />
      ))}
    </div>
  )
}
