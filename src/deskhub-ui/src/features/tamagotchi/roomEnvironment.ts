// Окружение комнаты кота: фаза суток (освещение) и небо за окном (реальная погода из стора).
// Не зависит от тем дашборда — комната живёт по своим часам и своему небу.

/** Фаза освещения комнаты (по реальному свету, а не по темам дашборда). */
export type RoomPhase = 'morning' | 'day' | 'evening' | 'night'

/** Утро 06–11, день 11–17, вечер 17–21, ночь 21–06. */
export function roomPhase(hour: number): RoomPhase {
  if (hour >= 6 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 17) return 'day'
  if (hour >= 17 && hour < 21) return 'evening'
  return 'night'
}

/** Небо за окном — из ключа иконки погоды (WeatherModel.icon, контракт с бэкендом). */
export type SkyCondition = 'clear' | 'partly' | 'overcast' | 'fog' | 'drizzle' | 'rain' | 'sleet' | 'snow' | 'storm'

export function skyFromWeatherIcon(icon: string | null | undefined): SkyCondition {
  switch (icon) {
    case 'partly-cloudy-day':
    case 'partly-cloudy-night':
      return 'partly'
    case 'cloudy':
      return 'overcast'
    case 'fog':
      return 'fog'
    case 'drizzle':
      return 'drizzle'
    case 'rain':
      return 'rain'
    case 'sleet':
      return 'sleet'
    case 'snow':
      return 'snow'
    case 'thunderstorm':
      return 'storm'
    default:
      return 'clear' // clear-day / clear-night / нет данных
  }
}

/** Осадки за окном — кот охотнее залипает в окно. */
export const hasPrecipitation = (sky: SkyCondition): boolean =>
  sky === 'drizzle' || sky === 'rain' || sky === 'sleet' || sky === 'snow' || sky === 'storm'

/** Небо закрыто тучами — не видно солнца/луны/звёзд, облака темнее. */
export const isOvercast = (sky: SkyCondition): boolean => sky !== 'clear' && sky !== 'partly'

/** Градиент неба (верх → низ): ясно и пасмурно для каждой фазы. */
export const SKY_GRADIENT: Record<RoomPhase, { clear: [string, string]; overcast: [string, string] }> = {
  morning: { clear: ['#7FA6D0', '#F2C6A8'], overcast: ['#8C97A3', '#C3B8AF'] },
  day: { clear: ['#3E78B8', '#8DB8E0'], overcast: ['#6B7A89', '#9AA6B2'] },
  evening: { clear: ['#3B2A5C', '#E0784A'], overcast: ['#3A3240', '#7A5A50'] },
  night: { clear: ['#05080F', '#14213A'], overcast: ['#0A0D14', '#171C27'] },
}

export const SKYLINE_COLOR: Record<RoomPhase, string> = {
  morning: '#3C4E66',
  day: '#2E4A6B',
  evening: '#2A1E33',
  night: '#0A1220',
}

/** Цвет облаков: ясным днём — светлые, в тучах и ночью — тёмные. */
export function cloudColor(phase: RoomPhase, sky: SkyCondition): string {
  const dark = isOvercast(sky)
  switch (phase) {
    case 'morning':
      return dark ? '#9AA1AB' : '#FFF4EC'
    case 'day':
      return dark ? '#8E99A5' : '#FFFFFF'
    case 'evening':
      return dark ? '#4A3C48' : '#F3B08C'
    case 'night':
      return dark ? '#20252F' : '#2A3348'
  }
}

/** Лампа горит вечером и ночью. */
export const lampOn = (phase: RoomPhase): boolean => phase === 'evening' || phase === 'night'

// ─── Геометрия комнаты (базовый макет 574×278) — общая для SVG, слоя погоды и освещения ─────

/**
 * Большое окно — доминанта стены и главный источник света (≈ 1.6 × 1.5 от прежнего 150×112,
 * площадь стекла ×2.4). Лампа, коврик и картина сдвинуты вправо, чтобы не налезать на шторы.
 */
export const WINDOW = {
  frame: { x: 36, y: 18, width: 232, height: 166 },
  glass: { x: 42, y: 24, width: 220, height: 154 },
  mullionX: 152,
  mullionY: 101,
  sill: { x: 26, y: 182, width: 252, height: 9 },
} as const

/** Центр лампы и коврика (раньше 300 — сдвинуто вправо под большое окно). */
export const LAMP_X = 340
