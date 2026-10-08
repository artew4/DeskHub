import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { forceTrafficRefresh, reportTrafficVisible } from '../../services/signalrConnection'
import { MAIN_SCREEN, useDashboardStore } from '../../store/useDashboardStore'
import { TamagotchiWidget } from '../tamagotchi/TamagotchiWidget'
import { TrafficWidget } from '../traffic/TrafficWidget'
import { useTrafficWindow } from '../traffic/useTrafficWindow'

type Slide = 'traffic' | 'cat'
const SLIDES: Slide[] = ['traffic', 'cat']
const other = (s: Slide): Slide => (s === 'traffic' ? 'cat' : 'traffic')

/** Свайп длиннее — переключение; быстрый флик — тоже. */
const SWIPE_THRESHOLD_PX = 45
const FLICK_VELOCITY = 0.5
const FLICK_MIN_PX = 20
/** Сдвиг, после которого жест признаётся вертикальным (или отдаётся горизонтальной карусели экранов). */
const AXIS_LOCK_PX = 10
/** Сколько пробки висят вне рабочего окна без касаний, прежде чем вернётся кот. */
export const TRAFFIC_PEEK_MS = 30_000
/** Пинг видимости пробок — сервер усыпляет TrafficWorker через 10 мин без пингов. */
const VISIBILITY_PING_MS = 90_000
/** Данные пробок старше — при показе виджета попросить сервер обновить сразу. */
const FORCE_REFRESH_AFTER_MS = 15 * 60_000

const TRANSITION = 'transform 500ms cubic-bezier(0.2, 0.8, 0.2, 1)' // ease-kiosk (ease-out)

interface Gesture {
  pointerId: number
  startX: number
  startY: number
  startTime: number
  axis: 'none' | 'y' | 'x'
  dy: number
}

/**
 * Левая нижняя ячейка главного экрана: вертикальная мини-карусель «Пробки ↔ Кот».
 *
 * - По умолчанию — по времени: Пн–Пт 10:00–13:20 пробки, иначе кот. Смена тайм-окна возвращает дефолт.
 * - Свайп вверх или вниз (> 45 px или флик) переключает виджет — бесконечная лента из двух элементов:
 *   входящий слой всегда подъезжает с той стороны, откуда тянут палец.
 * - Пробки, открытые вручную вне рабочего окна, через 30 с без касаний уезжают обратно к коту.
 *   Кот, открытый вручную в рабочее окно, остаётся до смены окна или следующего свайпа.
 *
 * Анимация — только transform двух абсолютных слоёв (will-change: transform), позиции пишутся напрямую
 * в style через ref: во время свайпа React не перерисовывается. Оба виджета смонтированы постоянно
 * (кот живёт своей жизнью и вне экрана), неактивный — inert.
 *
 * Пока пробки видны (ячейка + главный экран + связь), сервер получает пинг ReportTrafficVisible раз в 90 с
 * (и ForceTrafficRefresh, если данные старше 15 мин) — иначе TrafficWorker засыпает и не ходит в Яндекс.
 *
 * Конфликт с горизонтальной каруселью экранов (ScreenCarousel): эта карусель получает pointer-события
 * первой. Если жест вертикальный — забирает его (pointer capture + stopPropagation для pointermove),
 * и экранная карусель жест не видит; если горизонтальный — отказывается, и жест обрабатывает ScreenCarousel.
 */
export function BottomLeftCarousel() {
  const defaultSlide: Slide = useTrafficWindow() ? 'traffic' : 'cat'
  const [shown, setShown] = useState<Slide>(defaultSlide)
  // Пробки действительно видны: открыты в ячейке, активен главный экран и есть связь с сервером
  const onMainScreen = useDashboardStore((s) => s.activeScreenIndex === MAIN_SCREEN)
  const isConnected = useDashboardStore((s) => s.isConnected)
  const trafficVisible = shown === 'traffic' && onMainScreen && isConnected

  const shownRef = useRef<Slide>(defaultSlide)
  const defaultRef = useRef<Slide>(defaultSlide)
  const layers = useRef<Record<Slide, HTMLDivElement | null>>({ traffic: null, cat: null })
  const gesture = useRef<Gesture | null>(null)
  const peekTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  /** Позиция слоя: процент высоты ячейки + смещение пальца. */
  const place = (slide: Slide, percent: number, offsetPx = 0, animate = false) => {
    const el = layers.current[slide]
    if (!el) return
    el.style.transition = animate ? TRANSITION : 'none'
    el.style.transform = `translate3d(0, calc(${percent}% + ${offsetPx}px), 0)`
  }

  /**
   * Перелистнуть на target. direction: -1 — лента едет вверх (новый слой снизу), +1 — вниз (новый сверху).
   * fromOffsetPx — где сейчас текущий слой (после перетаскивания).
   */
  const goTo = useCallback((target: Slide, direction: -1 | 1, fromOffsetPx = 0) => {
    const current = shownRef.current
    if (target === current) {
      // Короткий свайп — пружиним обратно
      place(current, 0, 0, true)
      place(other(current), direction === -1 ? 100 : -100, 0, true)
      return
    }
    // Входящий слой мгновенно ставится с нужной стороны (если тянули — он уже там) …
    if (fromOffsetPx === 0) {
      place(target, direction === -1 ? 100 : -100)
      layers.current[target]?.getBoundingClientRect() // применить позицию до запуска перехода
    }
    // … и оба плавно едут
    place(current, direction === -1 ? -100 : 100, 0, true)
    place(target, 0, 0, true)
    shownRef.current = target
    setShown(target)
  }, [])

  // ─── Автовозврат пробок к коту вне рабочего окна ──────────────────────────
  const clearPeek = useCallback(() => {
    clearTimeout(peekTimer.current)
    peekTimer.current = undefined
  }, [])

  const armPeek = useCallback(() => {
    clearPeek()
    // Таймер — только когда вне рабочего окна (дефолт — кот) показаны пробки
    if (defaultRef.current === 'cat' && shownRef.current === 'traffic') {
      peekTimer.current = setTimeout(() => goTo('cat', 1), TRAFFIC_PEEK_MS)
    }
  }, [clearPeek, goTo])

  // Любое касание экрана, пока пробки «подсмотрены», откладывает возврат ещё на 30 с
  useEffect(() => {
    const onActivity = () => {
      if (peekTimer.current !== undefined) armPeek()
    }
    window.addEventListener('pointerdown', onActivity, { capture: true })
    return () => {
      window.removeEventListener('pointerdown', onActivity, { capture: true })
      clearPeek()
    }
  }, [armPeek, clearPeek])

  // Смена тайм-окна (10:00 / 13:21 в будни) — вернуть дефолт, ручной выбор сбрасывается
  useEffect(() => {
    defaultRef.current = defaultSlide
    clearPeek()
    if (shownRef.current !== defaultSlide) goTo(defaultSlide, -1)
  }, [defaultSlide, goTo, clearPeek])

  // ─── «Спящий режим» TrafficWorker: сообщаем серверу, что пробки на экране ──
  useEffect(() => {
    if (!trafficVisible) return
    reportTrafficVisible() // спящий воркер проснётся сразу
    const updatedAt = useDashboardStore.getState().traffic?.updatedAt
    if (!updatedAt || Date.now() - Date.parse(updatedAt) > FORCE_REFRESH_AFTER_MS) forceTrafficRefresh()
    const ping = setInterval(reportTrafficVisible, VISIBILITY_PING_MS)
    return () => clearInterval(ping) // пробки скрыты — пинги прекращаются, через 10 мин воркер уснёт
  }, [trafficVisible])

  // Начальная расстановка слоёв без анимации
  useLayoutEffect(() => {
    place(shownRef.current, 0)
    place(other(shownRef.current), 100)
  }, [])

  // ─── Вертикальный свайп ──────────────────────────────────────────────────
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // Новое касание всегда начинает новый жест (прошлый мог «уйти» в горизонтальную карусель)
    gesture.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startTime: e.timeStamp, axis: 'none', dy: 0 }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || g.pointerId !== e.pointerId || g.axis === 'x') return
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY

    if (g.axis === 'none') {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK_PX) return
      if (Math.abs(dx) >= Math.abs(dy)) {
        g.axis = 'x' // горизонтальный — это свайп экранов, не мешаем
        return
      }
      g.axis = 'y'
      e.currentTarget.setPointerCapture(e.pointerId)
    }

    // Вертикальный жест — наш: экранная карусель его не увидит
    e.stopPropagation()
    g.dy = dy
    const current = shownRef.current
    place(current, 0, dy)
    place(other(current), dy < 0 ? 100 : -100, dy) // входящий — с той стороны, откуда тянем
  }

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || g.pointerId !== e.pointerId) return
    gesture.current = null
    if (g.axis !== 'y') return

    const velocity = Math.abs(g.dy) / Math.max(1, e.timeStamp - g.startTime)
    const passed = e.type === 'pointerup' && (Math.abs(g.dy) > SWIPE_THRESHOLD_PX || (velocity >= FLICK_VELOCITY && Math.abs(g.dy) >= FLICK_MIN_PX))
    const direction: -1 | 1 = g.dy < 0 ? -1 : 1

    if (!passed) {
      goTo(shownRef.current, direction)
      return
    }
    goTo(other(shownRef.current), direction, g.dy)
    armPeek() // вне рабочего окна на пробках — запустить 30 с; вернулись к дефолту — снять
  }

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-card"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      {SLIDES.map((slide) => (
        <div
          key={slide}
          ref={(el) => {
            layers.current[slide] = el
          }}
          className="absolute inset-0 will-change-transform"
          inert={slide !== shown}
          aria-hidden={slide !== shown}
        >
          {slide === 'traffic' ? <TrafficWidget /> : <TamagotchiWidget />}
        </div>
      ))}

      {/* Вертикальный индикатор: подсказывает, что ячейку можно листать */}
      <div className="pointer-events-none absolute right-1.5 top-1/2 flex -translate-y-1/2 flex-col gap-1.5" aria-hidden>
        {SLIDES.map((slide) => (
          <span key={slide} className={`size-1.5 rounded-full transition-colors duration-500 ${slide === shown ? 'bg-fg-secondary' : 'bg-surface-2'}`} />
        ))}
      </div>
    </div>
  )
}
