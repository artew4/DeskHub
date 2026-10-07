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

// Компоненты читают стор только через селекторы: useDashboardStore((s) => s.weather)
export const useDashboardStore = create<DashboardState>()((set) => ({
  weather: null,
  traffic: [],
  telemetry: null,
  serverTime: null,

  connectionStatus: 'connecting',
  isConnected: false,

  setWeather: (weather) => set({ weather }),
  setTraffic: (traffic) => set({ traffic }),
  setTelemetry: (telemetry) => set({ telemetry }),
  applySnapshot: ({ weather, traffic, telemetry, serverTime }) =>
    set({ weather, traffic, telemetry, serverTime }),
  setConnectionStatus: (connectionStatus) =>
    set({ connectionStatus, isConnected: connectionStatus === 'connected' }),
}))
