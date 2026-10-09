import { useDashboardStore } from '../store/useDashboardStore'
import { wakeScreen } from '../services/signalrConnection'

/**
 * Программное затемнение поверх всего UI (z-[999]) по режиму питания с бэкенда:
 * - dimmed (00:00–01:30 и временное пробуждение ночью) — чёрный слой 50 %, касания проходят к интерфейсу;
 * - sleep (01:30–08:00 или кнопка «В режим сна») — сплошной чёрный экран; касание будит экран (WakeScreen):
 *   ночью — на 5 минут затемнённым, после ручного сна днём — в обычный режим.
 */
export function PowerOverlay() {
  const powerMode = useDashboardStore((s) => s.powerMode)

  if (powerMode === 'dimmed') {
    return <div className="pointer-events-none absolute inset-0 z-[999] bg-black/50 transition-opacity duration-700" aria-hidden />
  }

  if (powerMode === 'sleep') {
    // Будим по click, а не pointerdown: весь тап (down → up → click) достаётся чёрному слою и не «проваливается»
    // в интерфейс под ним — иначе тап в месте кнопки «В режим сна» тут же снова усыпил бы экран.
    // wakeScreen сразу ставит dimmed локально, ответ сервера уточняет режим (днём — normal).
    return (
      <div
        className="absolute inset-0 z-[999] bg-black"
        onClick={wakeScreen}
        role="button"
        aria-label="Экран спит. Коснитесь, чтобы включить"
      />
    )
  }

  return null
}
