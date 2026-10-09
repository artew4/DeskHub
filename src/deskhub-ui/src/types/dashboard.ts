// Зеркало C#-моделей из src/DeskHub.Api/Models. При изменении — править обе стороны.
// Даты приходят строками ISO 8601 (UTC), enum — строками в camelCase.

export interface WeatherModel {
  locationName: string
  temperature: number
  apparentTemperature: number
  weatherCode: number
  description: string
  /** Ключ иконки — см. src/features/weather/weatherIcons.ts */
  icon: string
  isDay: boolean
  precipitation: number
  uvIndex: number
  hourly: HourlyForecast[]
  updatedAt: string
}

export interface HourlyForecast {
  /** Начало часа, ISO со смещением часового пояса места */
  time: string
  temperature: number
  weatherCode: number
  icon: string
  precipitationProbability: number
}

export type CongestionLevel = 'free' | 'normal' | 'heavy' | 'severe'

export interface TrafficModel {
  originName: string
  originAddress: string
  destinationName: string
  destinationAddress: string
  routes: RouteModel[]
  updatedAt: string
}

export interface RouteModel {
  /** Стабильный ключ («ttk», «mkad») — определяет геометрию линии на схеме */
  id: string
  name: string
  durationMinutes: number
  congestion: CongestionLevel
  distanceKm: number
}

export interface TelemetryModel {
  cpuPercent: number
  ramUsedMb: number
  ramTotalMb: number
  temperatureC: number | null
  uptimeSeconds: number
  timestamp: string
}

export interface CalendarEventModel {
  title: string
  /** ISO со смещением пояса устройства; для «весь день» — полночь даты начала */
  startTime: string
  /** Не включительно; для «весь день» — полночь дня после последнего */
  endTime: string
  isAllDay: boolean
  location: string | null
  /** Цвет календаря-источника (#RRGGBB, палитра iOS) */
  color: string
}

export interface CalendarModel {
  events: CalendarEventModel[]
  /** Диапазон, за который загружены события: [rangeStart; rangeEnd) */
  rangeStart: string
  rangeEnd: string
  updatedAt: string
}

/** Режим питания экрана: normal 08–00, dimmed 00–01:30 (и временное пробуждение ночью), sleep 01:30–08 */
export type PowerMode = 'normal' | 'dimmed' | 'sleep'

export interface PowerModeModel {
  mode: PowerMode
  /** Конец временного пробуждения (WakeScreen ночью), иначе null */
  wakeUntil: string | null
  changedAt: string
}

export interface DashboardSnapshot {
  weather: WeatherModel | null
  traffic: TrafficModel | null
  telemetry: TelemetryModel | null
  calendar: CalendarModel | null
  powerMode: PowerMode
  /** Идентификатор запуска бэкенда — новый после каждого перезапуска/деплоя контейнера */
  instanceId: string
  serverTime: string
}
