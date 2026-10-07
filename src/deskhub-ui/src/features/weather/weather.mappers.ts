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

// ─── Умный почасовой прогноз ───────────────────────────────────────────────
// Что показывать, зависит от времени суток (локальное время устройства):
//   08:00–14:59  «Сегодня»  — картина дня до 23:00 с шагом 3 ч (или 2 ч, если не хватает слотов)
//   15:00–22:59  «Вечером»  — ближайшие часы до 01:00 с шагом 2 ч (или 1 ч)
//   23:00–07:59  «Завтра»   — дневной прогноз ближайших суток: 09, 12, 15, 18, 21
// Работает только с тем, что прислал бэкенд (24 ч от текущего часа): недостающие часы просто пропускаются,
// а если в окне режима нет ни одного часа — показываются ближайшие доступные («Далее»).

export type ForecastMode = 'today' | 'evening' | 'tomorrow'

export interface ForecastView {
  mode: ForecastMode
  title: string
  hours: HourlyForecast[]
}

const TITLES: Record<ForecastMode, string> = { today: 'Сегодня', evening: 'Вечером', tomorrow: 'Завтра' }
const FALLBACK_TITLE = 'Далее'
const TOMORROW_HOURS = [9, 12, 15, 18, 21]
const HOUR_MS = 3_600_000

export function forecastMode(now: Date): ForecastMode {
  const hour = now.getHours()
  if (hour >= 8 && hour < 15) return 'today'
  if (hour >= 15 && hour < 23) return 'evening'
  return 'tomorrow'
}

/** Локальная дата + час; переход через полночь/месяц делегируется Date. */
function atLocal(base: Date, dayOffset: number, hour: number): Date {
  const date = new Date(base)
  date.setDate(date.getDate() + dayOffset)
  date.setHours(hour, 0, 0, 0)
  return date
}

const timeOf = (h: HourlyForecast): number => Date.parse(h.time)

/**
 * Прореживание с шагом: первый час окна, затем каждый следующий не ближе step часов.
 * Если слотов не хватило, последним добавляется конец окна («как будет к ночи»).
 */
function pickWithStep(candidates: HourlyForecast[], stepHours: number, count: number): HourlyForecast[] {
  const picked: HourlyForecast[] = []
  for (const hour of candidates) {
    if (picked.length === count) break
    const last = picked.at(-1)
    if (!last || timeOf(hour) - timeOf(last) >= stepHours * HOUR_MS) picked.push(hour)
  }
  const windowEnd = candidates.at(-1)
  if (picked.length < count && windowEnd && picked.at(-1) !== windowEnd) picked.push(windowEnd)
  return picked
}

/** Пробует шаги по убыванию; берёт первый, заполнивший все слоты, иначе — самый полный вариант. */
function spread(candidates: HourlyForecast[], steps: number[], count: number): HourlyForecast[] {
  let best: HourlyForecast[] = []
  for (const step of steps) {
    const picked = pickWithStep(candidates, step, count)
    if (picked.length === count) return picked
    if (picked.length > best.length) best = picked
  }
  return best
}

export function selectForecast(hourly: HourlyForecast[], now: Date, count = 5): ForecastView {
  const mode = forecastMode(now)
  const sorted = [...hourly].sort((a, b) => timeOf(a) - timeOf(b))
  const between = (from: number, to: number) => sorted.filter((h) => timeOf(h) > from && timeOf(h) <= to)

  let hours: HourlyForecast[]
  switch (mode) {
    case 'today':
      // от следующего часа до 23:00 сегодняшнего дня
      hours = spread(between(now.getTime(), atLocal(now, 0, 23).getTime()), [3, 2, 1], count)
      break
    case 'evening':
      // от следующего часа до 01:00 следующих суток
      hours = spread(between(now.getTime(), atLocal(now, 1, 1).getTime()), [2, 1], count)
      break
    case 'tomorrow': {
      // в 23:xx «завтра» — следующая дата; после полуночи — уже текущая
      const dayOffset = now.getHours() >= 23 ? 1 : 0
      const wanted = new Set(TOMORROW_HOURS.map((h) => atLocal(now, dayOffset, h).getTime()))
      hours = sorted.filter((h) => wanted.has(timeOf(h))).slice(0, count)
      break
    }
  }

  if (hours.length === 0) {
    // Данных на нужное окно нет (короткий ответ бэкенда) — лучше ближайшие часы, чем пустой блок
    const upcoming = sorted.filter((h) => timeOf(h) > now.getTime()).slice(0, count)
    if (upcoming.length > 0) return { mode, title: FALLBACK_TITLE, hours: upcoming }
  }

  return { mode, title: TITLES[mode], hours }
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
