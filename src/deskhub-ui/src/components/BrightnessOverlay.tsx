import { useBrightnessStore } from '../store/useBrightnessStore'

/**
 * Программная яркость: чёрный слой поверх всего UI с прозрачностью 1 − яркость (100 % → 0, 10 % → 0.9).
 * Слой, а не filter: brightness() на корне — на Pi фильтр пересчитывал бы весь экран на каждом кадре анимаций,
 * а однотонный слой с opacity композитор смешивает бесплатно. Касания проходят насквозь; под PowerOverlay.
 */
export function BrightnessOverlay() {
  const brightness = useBrightnessStore((s) => s.brightness)
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[998] bg-black"
      style={{ opacity: 1 - brightness / 100 }}
      aria-hidden
    />
  )
}
