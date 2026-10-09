import { create } from 'zustand'
import type { CalendarModel, DashboardSnapshot, PowerMode, TelemetryModel, TrafficModel, WeatherModel } from '../types/dashboard'

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

/** Экраны карусели: 0 — главный, 1 — системный. */
export const SCREEN_COUNT = 2
export const MAIN_SCREEN = 0
/** Через сколько без касаний неглавный экран возвращается на главный. */
export const IDLE_RETURN_MS = 30_000

interface DashboardState {
  weather: WeatherModel | null
  traffic: TrafficModel | null
  telemetry: TelemetryModel | null
  calendar: CalendarModel | null
  serverTime: string | null
  /** InstanceId бэкенда из первого снимка; другой id в следующем снимке — бэкенд перезапущен */
  instanceId: string | null
  powerMode: PowerMode

  connectionStatus: ConnectionStatus
  isConnected: boolean

  activeScreenIndex: number

  setWeather: (weather: WeatherModel) => void
  setTraffic: (traffic: TrafficModel) => void
  setTelemetry: (telemetry: TelemetryModel) => void
  setCalendar: (calendar: CalendarModel) => void
  setPowerMode: (mode: PowerMode) => void
  applySnapshot: (snapshot: DashboardSnapshot) => void
  setConnectionStatus: (status: ConnectionStatus) => void

  nextScreen: () => void
  prevScreen: () => void
  setScreen: (index: number) => void
  /** Любое касание экрана: перезапускает таймер автовозврата. */
  registerActivity: () => void
}

// ─── Автообновление фронтенда после деплоя ─────────────────────────────────
let reloading = false

/**
 * Новый InstanceId = новый контейнер, а с ним, возможно, и новый фронтенд. index.html отдаётся с no-cache,
 * ассеты — с хэшами в именах, поэтому обычная перезагрузка гарантированно подтягивает свежую сборку.
 */
function reloadForNewInstance(previous: string, next: string): void {
  if (reloading) return
  reloading = true
  console.info(`[deskhub] backend restarted (${previous.slice(0, 8)} → ${next.slice(0, 8)}), reloading page`)
  window.location.reload()
}

// ─── Автовозврат на главный экран ──────────────────────────────────────────
// Таймер живёт вне React: его запускают/сбрасывают экшены навигации и registerActivity().
let idleTimer: ReturnType<typeof setTimeout> | undefined

function scheduleIdleReturn(index: number): void {
  clearTimeout(idleTimer)
  idleTimer = undefined
  if (index !== MAIN_SCREEN) {
    idleTimer = setTimeout(() => useDashboardStore.getState().setScreen(MAIN_SCREEN), IDLE_RETURN_MS)
  }
}

const clampScreen = (index: number) => Math.min(SCREEN_COUNT - 1, Math.max(0, Math.round(index)))

/**
 * true, если входящие данные не старее текущих. Защита от гонки snapshot ↔ push:
 * snapshot, запрошенный до push-события, может прийти после него и не должен его затереть.
 */
export function isNotOlder(incoming: string, current: string | null | undefined): boolean {
  return current == null || Date.parse(incoming) >= Date.parse(current)
}

const acceptWeather = (incoming: WeatherModel | null, current: WeatherModel | null) =>
  incoming != null && isNotOlder(incoming.updatedAt, current?.updatedAt)

const acceptTelemetry = (incoming: TelemetryModel | null, current: TelemetryModel | null) =>
  incoming != null && isNotOlder(incoming.timestamp, current?.timestamp)

const acceptCalendar = (incoming: CalendarModel | null, current: CalendarModel | null) =>
  incoming != null && isNotOlder(incoming.updatedAt, current?.updatedAt)

const acceptTraffic = (incoming: TrafficModel | null, current: TrafficModel | null) =>
  incoming != null && isNotOlder(incoming.updatedAt, current?.updatedAt)

// Компоненты читают стор только через селекторы: useDashboardStore((s) => s.weather)
export const useDashboardStore = create<DashboardState>()((set, get) => ({
  weather: null,
  traffic: null,
  telemetry: null,
  calendar: null,
  instanceId: null,
  powerMode: 'normal',
  serverTime: null,

  connectionStatus: 'connecting',
  isConnected: false,

  setWeather: (weather) => set((s) => (acceptWeather(weather, s.weather) ? { weather } : s)),
  setTraffic: (traffic) => set((s) => (acceptTraffic(traffic, s.traffic) ? { traffic } : s)),
  setTelemetry: (telemetry) => set((s) => (acceptTelemetry(telemetry, s.telemetry) ? { telemetry } : s)),
  setCalendar: (calendar) => set((s) => (acceptCalendar(calendar, s.calendar) ? { calendar } : s)),
  setPowerMode: (powerMode) => set({ powerMode }),

  // Каждая часть snapshot проходит ту же проверку свежести, что и push-события
  applySnapshot: (snapshot) => {
    const knownInstance = get().instanceId
    if (knownInstance !== null && knownInstance !== snapshot.instanceId) {
      // Бэкенд перезапущен (деплой новой версии) — данные не применяем, перезагружаем страницу,
      // чтобы Chromium скачал новый фронтенд из обновлённого контейнера
      reloadForNewInstance(knownInstance, snapshot.instanceId)
      return
    }
    const { weather, traffic, telemetry, calendar, serverTime, instanceId, powerMode } = snapshot
    set((s) => ({
      weather: acceptWeather(weather, s.weather) ? weather : s.weather,
      traffic: acceptTraffic(traffic, s.traffic) ? traffic : s.traffic,
      telemetry: acceptTelemetry(telemetry, s.telemetry) ? telemetry : s.telemetry,
      calendar: acceptCalendar(calendar, s.calendar) ? calendar : s.calendar,
      serverTime,
      instanceId,
      powerMode: powerMode ?? s.powerMode,
    }))
  },

  setConnectionStatus: (connectionStatus) =>
    set({ connectionStatus, isConnected: connectionStatus === 'connected' }),

  activeScreenIndex: MAIN_SCREEN,

  setScreen: (index) => {
    const activeScreenIndex = clampScreen(index)
    set({ activeScreenIndex })
    scheduleIdleReturn(activeScreenIndex)
  },
  nextScreen: () => get().setScreen(get().activeScreenIndex + 1),
  prevScreen: () => get().setScreen(get().activeScreenIndex - 1),
  registerActivity: () => scheduleIdleReturn(get().activeScreenIndex),
}))
