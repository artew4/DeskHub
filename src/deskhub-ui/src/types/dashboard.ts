// Зеркало C#-моделей из src/DeskHub.Api/Models. При изменении — править обе стороны.
// Даты приходят строками ISO 8601 (UTC), enum — строками в camelCase.

export interface WeatherModel {
  temperature: number
  description: string
  icon: string
  updatedAt: string
}

export type CongestionLevel = 'free' | 'moderate' | 'heavy' | 'severe'

export interface TrafficModel {
  routeName: string
  durationMinutes: number
  congestion: CongestionLevel
  updatedAt: string
}

export interface TelemetryModel {
  cpuPercent: number
  ramUsedMb: number
  ramTotalMb: number
  temperatureC: number | null
  uptimeSeconds: number
  timestamp: string
}

export interface DashboardSnapshot {
  weather: WeatherModel | null
  traffic: TrafficModel[]
  telemetry: TelemetryModel | null
  serverTime: string
}
