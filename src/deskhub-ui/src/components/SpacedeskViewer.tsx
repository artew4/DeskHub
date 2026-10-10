import { X } from 'lucide-react'
import { useDashboardStore } from '../store/useDashboardStore'
import { useDisplaySettingsStore } from '../store/useDisplaySettingsStore'

/**
 * Официальный Spacedesk HTML5 Viewer (локальный порт 31100 на ПК разработчики больше не поддерживают).
 * Адрес ПК с Spacedesk Driver (192.168.0.136) вводится в самом viewer при подключении.
 */
export const SPACEDESK_URL = 'http://viewer.spacedesk.net/'

/**
 * Режим «Второй экран ПК»: полноэкранный iframe со Spacedesk поверх всего UI (z-[9999]) — киоск становится
 * дополнительным сенсорным монитором ПК по Wi-Fi. Касания уходят в iframe (Spacedesk передаёт их на ПК).
 *
 * - Монтируется только при isSpacedeskActive: закрытие размонтирует iframe — поток с ПК и декодирование видео
 *   останавливаются, Pi не тратит на них CPU/GPU.
 * - В режиме сна (powerMode = sleep) не рендерится: иначе слой выше PowerOverlay закрыл бы чёрный экран и перехватил
 *   касание пробуждения. После пробуждения режим возвращается (флаг не сбрасывается), iframe подключается заново.
 * - Слои яркости и Night Shift ниже — на картинку ПК не действуют (её яркость регулирует Windows).
 */
export function SpacedeskViewer() {
  const active = useDisplaySettingsStore((s) => s.isSpacedeskActive)
  const close = useDisplaySettingsStore((s) => s.closeSpacedesk)
  const asleep = useDashboardStore((s) => s.powerMode === 'sleep')

  if (!active || asleep) return null

  return (
    <div className="fixed inset-0 z-[9999] bg-black">
      <iframe src={SPACEDESK_URL} title="Второй экран ПК (Spacedesk)" className="h-full w-full border-0" allow="fullscreen" allowFullScreen />
      {/* Сверху по центру: снизу по центру в Windows 11 — кнопка «Пуск», справа сверху — крестики окон */}
      <button
        type="button"
        onClick={close}
        className="absolute left-1/2 top-3 flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-black/55 px-5 text-label font-semibold text-white ring-1 ring-white/20 transition-transform duration-150 ease-kiosk active:scale-95"
      >
        <X className="size-5" aria-hidden />
        Закрыть
      </button>
    </div>
  )
}
