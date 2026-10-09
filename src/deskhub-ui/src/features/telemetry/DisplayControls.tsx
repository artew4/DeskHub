import { Moon, Sun } from 'lucide-react'
import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { setSleepMode } from '../../services/signalrConnection'
import { MAX_BRIGHTNESS, MIN_BRIGHTNESS, useBrightnessStore } from '../../store/useBrightnessStore'

/** Бегунок и высота трека — 44 px: комфортная зона под палец на тачскрине. */
const THUMB_PX = 44
const KEY_STEP = 5

/** Блок управления экраном внизу карточки «Система»: яркость и кнопка сна. */
export function DisplayControls() {
  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-fg-muted/20 pt-4">
      <BrightnessSlider />
      <button
        type="button"
        onClick={setSleepMode}
        className="flex h-12 items-center justify-center gap-2 rounded-xl bg-surface-2 text-label font-semibold text-fg-primary transition-transform duration-150 ease-kiosk active:scale-[0.97]"
      >
        <Moon className="size-5 text-fg-secondary" aria-hidden />В режим сна
      </button>
    </div>
  )
}

/**
 * Слайдер яркости 10–100 %. Свой (не input range): трек и бегунок по 44 px, одинаково в любой теме.
 * Жест не доходит до карусели экранов (stopPropagation на pointerdown) — горизонтальное движение по слайдеру
 * не листает экран; захват указателя — тянуть можно и за пределами трека.
 */
function BrightnessSlider() {
  const brightness = useBrightnessStore((s) => s.brightness)
  const setBrightness = useBrightnessStore((s) => s.setBrightness)
  const trackRef = useRef<HTMLDivElement>(null)
  const fraction = (brightness - MIN_BRIGHTNESS) / (MAX_BRIGHTNESS - MIN_BRIGHTNESS)

  const setFromPointer = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    // Центр бегунка ходит от THUMB/2 до width − THUMB/2
    const f = Math.min(1, Math.max(0, (clientX - rect.left - THUMB_PX / 2) / (rect.width - THUMB_PX)))
    setBrightness(MIN_BRIGHTNESS + f * (MAX_BRIGHTNESS - MIN_BRIGHTNESS))
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setFromPointer(e.clientX)
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) setFromPointer(e.clientX)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = { ArrowLeft: -KEY_STEP, ArrowDown: -KEY_STEP, ArrowRight: KEY_STEP, ArrowUp: KEY_STEP }[e.key]
    if (delta) {
      e.preventDefault()
      setBrightness(brightness + delta)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Sun className="size-6 shrink-0 text-amber-400 light:text-amber-500" aria-hidden />
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Яркость экрана"
        aria-valuemin={MIN_BRIGHTNESS}
        aria-valuemax={MAX_BRIGHTNESS}
        aria-valuenow={brightness}
        aria-valuetext={`${brightness}%`}
        className="relative h-11 flex-1 cursor-pointer touch-none rounded-full bg-surface-2 outline-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
      >
        {/* Заливка — до центра бегунка (минимум — под самим бегунком) */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-amber-400/80 light:bg-amber-400"
          style={{ width: `calc((100% - ${THUMB_PX}px) * ${fraction} + ${THUMB_PX}px)` }}
        />
        <div
          className="absolute top-0 size-11 rounded-full border border-black/10 bg-white shadow-md"
          style={{ left: `calc((100% - ${THUMB_PX}px) * ${fraction})` }}
        />
      </div>
      <span className="w-[72px] shrink-0 text-right text-2xl font-semibold tabular-nums text-fg-primary">{brightness}%</span>
    </div>
  )
}
