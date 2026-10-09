import { useDashboardStore } from '../store/useDashboardStore'
import { wakeScreen } from '../services/signalrConnection'

/**
 * Программное затемнение поверх всего UI (z-[999]) по режиму питания с бэкенда:
 * - dimmed (00:00–01:30 и временное пробуждение ночью) — чёрный слой 50 %, касания проходят к интерфейсу;
 * - sleep (01:30–08:00) — сплошной чёрный экран; касание будит экран на 5 минут (WakeScreen).
 */
export function PowerOverlay() {
  const powerMode = useDashboardStore((s) => s.powerMode)

  if (powerMode === 'dimmed') {
    return <div className="pointer-events-none absolute inset-0 z-[999] bg-black/50 transition-opacity duration-700" aria-hidden />
  }

  if (powerMode === 'sleep') {
    const wake = () => {
      // Оптимистично: сразу показать затемнённый экран; сервер подтвердит PowerModeChanged и через 5 мин вернёт sleep
      useDashboardStore.getState().setPowerMode('dimmed')
      wakeScreen()
    }
    return (
      <div
        className="absolute inset-0 z-[999] bg-black"
        onPointerDown={wake}
        role="button"
        aria-label="Экран спит. Коснитесь, чтобы включить на 5 минут"
      />
    )
  }

  return null
}
