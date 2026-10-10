import type { MoonPhase, WeatherAstronomy } from '../../types/dashboard'
import type { RoomPhase } from '../tamagotchi/roomEnvironment'

// Математика неба Hero-виджета: фаза освещения по солнцу, дуга солнца и луны, форма лунного серпа.
// Все моменты — epoch ms; восход/закат приходят с бэкенда абсолютными (со смещением часового пояса места).

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export interface SunTimes {
  sunrise: number
  sunset: number
  /** Восход после заката — конец ночи */
  nextSunrise: number
}

/** Время дня в локальном часовом поясе устройства (для запасных значений). */
const atLocal = (now: Date, hours: number) => {
  const d = new Date(now)
  d.setHours(hours, 0, 0, 0)
  return d.getTime()
}

const parse = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN)

/**
 * Восход/закат из WeatherModel.astronomy. Нет данных (загрузка, полярный день/ночь) — 07:00 и 20:00 по часам устройства,
 * как и запасной isDay на бэкенде; нет восхода завтра — восход сегодня + 24 ч.
 */
export function sunTimes(now: Date, astronomy: WeatherAstronomy | null | undefined): SunTimes {
  let sunrise = parse(astronomy?.sunrise)
  let sunset = parse(astronomy?.sunset)
  if (!Number.isFinite(sunrise) || !Number.isFinite(sunset) || sunset <= sunrise) {
    sunrise = atLocal(now, 7)
    sunset = atLocal(now, 20)
  }
  const next = parse(astronomy?.nextSunrise)
  return { sunrise, sunset, nextSunrise: Number.isFinite(next) && next > sunset ? next : sunrise + DAY }
}

/**
 * Фаза неба по солнцу, а не по часам: рассвет — от 40 мин до восхода до 1.5 ч после; закат — за час до заката
 * и 40 мин после; между ними день, остальное — ночь. Ключи совпадают с фазами комнаты кота (градиенты SKY_GRADIENT).
 */
export function skyPhase(now: number, t: SunTimes): RoomPhase {
  if (now >= t.sunrise - 40 * MINUTE && now < t.sunrise + 90 * MINUTE) return 'morning'
  if (now >= t.sunrise + 90 * MINUTE && now < t.sunset - HOUR) return 'day'
  if (now >= t.sunset - HOUR && now < t.sunset + 40 * MINUTE) return 'evening'
  return 'night'
}

export interface CelestialState {
  /** Какое светило над горизонтом */
  body: 'sun' | 'moon'
  /** Доля пути по дуге: 0 — восход (левый край), 1 — заход (правый) */
  progress: number
}

const fraction = (now: number, from: number, to: number) => Math.min(1, Math.max(0, (now - from) / (to - from)))

/**
 * День: солнце, p = (now − восход) / (закат − восход).
 * Ночь после заката: луна, p = (now − закат) / (восход завтра − закат).
 * Ночь до восхода (после полуночи): луна, p = (now − (закат − 24 ч)) / (восход − (закат − 24 ч)) — вчерашний закат
 * оценивается сегодняшним минус сутки (wttr.in не присылает вчерашний день).
 */
export function celestialState(now: number, t: SunTimes): CelestialState {
  if (now >= t.sunrise && now < t.sunset) return { body: 'sun', progress: fraction(now, t.sunrise, t.sunset) }
  if (now >= t.sunset) return { body: 'moon', progress: fraction(now, t.sunset, t.nextSunrise) }
  return { body: 'moon', progress: fraction(now, t.sunset - DAY, t.sunrise) }
}

/** Дуга — полуэллипс с центром внизу по центру виджета (на линии горизонта), полуоси в % ширины и высоты. */
export const ARC = { centerX: 50, horizonY: 74, radiusX: 41, radiusY: 60 } as const

/**
 * Позиция светила в % от размеров виджета: θ = π·p (0 — левый горизонт, π/2 — зенит, π — правый горизонт);
 * x = cx − Rx·cos θ, y = horizon − Ry·sin θ.
 */
export function arcPosition(progress: number): { x: number; y: number; elevation: number } {
  const theta = Math.PI * progress
  const elevation = Math.sin(theta)
  return { x: ARC.centerX - ARC.radiusX * Math.cos(theta), y: ARC.horizonY - ARC.radiusY * elevation, elevation }
}

/**
 * Освещённая доля диска (0…1) и сторона: растущая луна освещена справа (северное полушарие), убывающая — слева.
 * Фаза wttr.in надёжнее процента (бывает «Waxing Crescent» при 0 %), поэтому процент зажимается в диапазон фазы:
 * серп — хотя бы тонкая полоска, четверть — ровно половина, полнолуние — полный диск.
 */
export function moonLight(phase: MoonPhase | undefined, illumination: number | undefined): { fraction: number; waxing: boolean } {
  const k = Math.min(1, Math.max(0, (illumination ?? 50) / 100))
  const clamp = (lo: number, hi: number) => Math.min(hi, Math.max(lo, k))
  switch (phase) {
    case 'newMoon':
      return { fraction: Math.min(k, 0.02), waxing: true }
    case 'waxingCrescent':
      return { fraction: clamp(0.07, 0.45), waxing: true }
    case 'firstQuarter':
      return { fraction: 0.5, waxing: true }
    case 'waxingGibbous':
      return { fraction: clamp(0.55, 0.93), waxing: true }
    case 'fullMoon':
      return { fraction: 1, waxing: true }
    case 'waningGibbous':
      return { fraction: clamp(0.55, 0.93), waxing: false }
    case 'lastQuarter':
      return { fraction: 0.5, waxing: false }
    case 'waningCrescent':
      return { fraction: clamp(0.07, 0.45), waxing: false }
    default:
      return { fraction: k, waxing: true }
  }
}

/**
 * Контур освещённой части диска радиуса r с центром (0, 0), освещена правая сторона (для убывающей — зеркалим).
 * Внешний край — правая полуокружность (верх → низ); терминатор — полуэллипс с полуосями (r·|1 − 2f|, r) обратно
 * снизу вверх: при f < 0.5 он выгнут вправо (серп), при f > 0.5 — влево (горбатая луна), f = 0.5 — прямая (четверть).
 */
export function moonLitPath(r: number, litFraction: number): string {
  const rx = r * Math.abs(1 - 2 * litFraction)
  const sweep = litFraction < 0.5 ? 0 : 1
  return `M0,${-r} A${r},${r} 0 0 1 0,${r} A${rx.toFixed(2)},${r} 0 0 ${sweep} 0,${-r} Z`
}
