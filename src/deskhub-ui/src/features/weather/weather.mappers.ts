import type { HourlyForecast } from '../../types/dashboard'

/** Порог устаревания: бэкенд обновляет погоду раз в 15 мин. */
export const WEATHER_STALE_AFTER_MS = 30 * 60_000

/** 12.4 → «+12°», −3.6 → «−4°» (типографский минус U+2212), 0 → «0°». */
export function formatTemperature(celsius: number): string {
  const rounded = Math.round(celsius)
  if (rounded > 0) return `+${rounded}°`
  if (rounded < 0) return `−${Math.abs(rounded)}°`
  return '0°'
}

const hourFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false })

/** Час прогноза в локальном времени устройства: «15:00». */
export const formatHour = (iso: string): string => hourFormat.format(new Date(iso))

/** Ближайшие часы, начиная со следующего полного часа относительно now. */
export function upcomingHours(hourly: HourlyForecast[], now: Date, count: number): HourlyForecast[] {
  return hourly.filter((h) => Date.parse(h.time) > now.getTime()).slice(0, count)
}

export interface UvCategory {
  label: string
  className: string
}

/** Шкала ВОЗ: 0–2 низкий, 3–5 умеренный, 6–7 высокий, 8–10 очень высокий, 11+ экстремальный. */
export function uvCategory(uv: number): UvCategory {
  const value = Math.round(uv)
  if (value <= 2) return { label: 'Низкий', className: 'text-status-ok' }
  if (value <= 5) return { label: 'Умеренный', className: 'text-yellow-300' }
  if (value <= 7) return { label: 'Высокий', className: 'text-status-warn' }
  if (value <= 10) return { label: 'Очень высокий', className: 'text-status-bad' }
  return { label: 'Экстремальный', className: 'text-violet-400' }
}

/** 0.0 → «0 мм», 0.4 → «0.4 мм», 3.25 → «3.3 мм». */
export const formatPrecipitation = (mm: number): string => `${mm === 0 ? 0 : mm.toFixed(1)} мм`

/** Минуты с момента обновления — для пометки устаревших данных. */
export const minutesSince = (iso: string, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60_000))
