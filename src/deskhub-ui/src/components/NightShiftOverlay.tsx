import { useDisplaySettingsStore } from '../store/useDisplaySettingsStore'

/**
 * Night Shift: тёплый полупрозрачный слой поверх всего UI (rgba(255, 140, 0, 0.15)) — обычная композиция слоя,
 * без filter / mix-blend-mode, чтобы не нагружать GPU Pi. Включение/выключение — плавный opacity.
 * Независим от слоя яркости: оба — отдельные div с pointer-events: none. По z-index — ниже яркости (z-[998])
 * и PowerOverlay (z-[999]): яркость приглушает и тёплый оттенок, а экран сна остаётся чисто чёрным, без оранжевого налёта.
 */
export function NightShiftOverlay() {
  const enabled = useDisplaySettingsStore((s) => s.nightShiftEnabled)
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[997] transition-opacity duration-500"
      style={{ backgroundColor: 'rgba(255, 140, 0, 0.15)', opacity: enabled ? 1 : 0 }}
      aria-hidden
    />
  )
}
