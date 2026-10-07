import { create } from 'zustand'
import type { DashboardSnapshot, TelemetryModel, TrafficModel, WeatherModel } from '../types/dashboard'

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

interface DashboardState {
  weather: WeatherModel | null
  traffic: TrafficModel[]
  telemetry: TelemetryModel | null
  serverTime: string | null

  connectionStatus: ConnectionStatus
  isConnected: boolean

  setWeather: (weather: WeatherModel) => void
  setTraffic: (traffic: TrafficModel[]) => void
  setTelemetry: (telemetry: TelemetryModel) => void
  applySnapshot: (snapshot: DashboardSnapshot) => void
  setConnectionStatus: (status: ConnectionStatus) => void
}

/**
 * true, если входящие данные не старее текущих. Защита от гонки snapshot ↔ push:
 * snapshot, запрошенный до push-события, может прийти после него и не должен его затереть.
 */
export function isNotOlder(incoming: string, current: string | null | undefined): boolean {
  return current == null || Date.parse(incoming) >= Date.parse(current)
}

// Маршруты обновляются одним сообщением — сравниваем по самому свежему updatedAt
const latestUpdate = (traffic: TrafficModel[]): string | null =>
  traffic.reduce<string | null>((max, r) => (max == null || isNotOlder(r.updatedAt, max) ? r.updatedAt : max), null)

const acceptWeather = (incoming: WeatherModel | null, current: WeatherModel | null) =>
  incoming != null && isNotOlder(incoming.updatedAt, current?.updatedAt)

const acceptTelemetry = (incoming: TelemetryModel | null, current: TelemetryModel | null) =>
  incoming != null && isNotOlder(incoming.timestamp, current?.timestamp)

const acceptTraffic = (incoming: TrafficModel[], current: TrafficModel[]) => {
  const incomingAt = latestUpdate(incoming)
  return incomingAt != null && isNotOlder(incomingAt, latestUpdate(current))
}

// Компоненты читают стор только через селекторы: useDashboardStore((s) => s.weather)
export const useDashboardStore = create<DashboardState>()((set) => ({
  weather: null,
  traffic: [],
  telemetry: null,
  serverTime: null,

  connectionStatus: 'connecting',
  isConnected: false,

  setWeather: (weather) => set((s) => (acceptWeather(weather, s.weather) ? { weather } : s)),
  setTraffic: (traffic) => set((s) => (acceptTraffic(traffic, s.traffic) ? { traffic } : s)),
  setTelemetry: (telemetry) => set((s) => (acceptTelemetry(telemetry, s.telemetry) ? { telemetry } : s)),

  // Каждая часть snapshot проходит ту же проверку свежести, что и push-события
  applySnapshot: ({ weather, traffic, telemetry, serverTime }) =>
    set((s) => ({
      weather: acceptWeather(weather, s.weather) ? weather : s.weather,
      traffic: acceptTraffic(traffic, s.traffic) ? traffic : s.traffic,
      telemetry: acceptTelemetry(telemetry, s.telemetry) ? telemetry : s.telemetry,
      serverTime,
    })),

  setConnectionStatus: (connectionStatus) =>
    set({ connectionStatus, isConnected: connectionStatus === 'connected' }),
}))
