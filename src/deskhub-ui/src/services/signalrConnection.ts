import { HttpTransportType, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr'
import { useDashboardStore, type ConnectionStatus } from '../store/useDashboardStore'
import type { CalendarModel, DashboardSnapshot, PowerModeModel, TelemetryModel, TrafficModel, WeatherModel } from '../types/dashboard'

// Имена событий — зеркало src/DeskHub.Api/Hubs/HubEvents.cs
export const HubEvents = {
  WeatherUpdated: 'WeatherUpdated',
  TrafficUpdated: 'TrafficUpdated',
  TelemetryTick: 'TelemetryTick',
  CalendarUpdated: 'CalendarUpdated',
  PowerModeChanged: 'PowerModeChanged',
} as const

const HUB_URL = '/hubs/dashboard'
const SNAPSHOT_URL = '/api/dashboard/snapshot'
const MAX_RETRY_DELAY_MS = 30_000
// Страховка для режима 24/7: если связь не восстановилась за это время — перезагрузить страницу
const RELOAD_AFTER_DISCONNECT_MS = 10 * 60_000

// Экспоненциальная задержка 1 → 2 → 4 … → 30 с + джиттер. Никогда не сдаёмся (киоск 24/7).
const retryDelay = (attempt: number) =>
  Math.min(MAX_RETRY_DELAY_MS, 1_000 * 2 ** attempt) + Math.random() * 1_000

const connection = new HubConnectionBuilder()
  .withUrl(HUB_URL, { transport: HttpTransportType.WebSockets, skipNegotiation: true })
  .withAutomaticReconnect({ nextRetryDelayInMilliseconds: ({ previousRetryCount }) => retryDelay(previousRetryCount) })
  .withServerTimeout(30_000)
  .withKeepAliveInterval(10_000)
  .configureLogging(import.meta.env.DEV ? LogLevel.Information : LogLevel.Warning)
  .build()

const store = () => useDashboardStore.getState()

let reloadTimer: ReturnType<typeof setTimeout> | undefined

/** Обновляет статус в сторе и ведёт watchdog: таймер перезагрузки идёт, пока нет подключения. */
function setStatus(status: ConnectionStatus): void {
  store().setConnectionStatus(status)

  if (status === 'connected') {
    clearTimeout(reloadTimer)
    reloadTimer = undefined
  } else if (reloadTimer === undefined) {
    reloadTimer = setTimeout(() => {
      console.warn(`[signalr] no connection for ${RELOAD_AFTER_DISCONNECT_MS / 60_000} min, reloading page`)
      window.location.reload()
    }, RELOAD_AFTER_DISCONNECT_MS)
  }
}

async function loadSnapshot(): Promise<void> {
  try {
    const response = await fetch(SNAPSHOT_URL, { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    store().applySnapshot((await response.json()) as DashboardSnapshot)
  } catch (error) {
    // Не критично: остаются последние данные, push-события продолжат обновлять стор
    console.warn('[signalr] snapshot load failed', error)
  }
}

function bindEvents(): void {
  connection.on(HubEvents.WeatherUpdated, (weather: WeatherModel) => store().setWeather(weather))
  connection.on(HubEvents.TrafficUpdated, (traffic: TrafficModel) => store().setTraffic(traffic))
  connection.on(HubEvents.PowerModeChanged, (power: PowerModeModel) => store().setPowerMode(power.mode))
  connection.on(HubEvents.CalendarUpdated, (calendar: CalendarModel) => store().setCalendar(calendar))
  connection.on(HubEvents.TelemetryTick, (telemetry: TelemetryModel) => store().setTelemetry(telemetry))

  connection.onreconnecting(() => setStatus('reconnecting'))
  connection.onreconnected(() => {
    setStatus('connected')
    void loadSnapshot() // закрыть «дыру» в данных за время обрыва
  })
  // onclose после withAutomaticReconnect срабатывает, только если реконнект прерван —
  // перезапускаем подключение вручную, чтобы киоск не остался без связи.
  connection.onclose(() => {
    setStatus('disconnected')
    void startWithRetry()
  })
}

// withAutomaticReconnect не покрывает первый start() — его ретраи делаем сами.
async function startWithRetry(attempt = 0): Promise<void> {
  if (connection.state !== HubConnectionState.Disconnected) return
  setStatus('connecting')
  try {
    await connection.start()
    setStatus('connected')
    await loadSnapshot()
  } catch (error) {
    setStatus('disconnected')
    console.warn(`[signalr] start failed (attempt ${attempt + 1})`, error)
    setTimeout(() => void startWithRetry(attempt + 1), retryDelay(attempt))
  }
}

// ─── Вызовы хаба (клиент → сервер) ────────────────────────────────────────

/** Имена методов DashboardHub — зеркало src/DeskHub.Api/Hubs/DashboardHub.cs */
export const HubMethods = {
  ReportTrafficVisible: 'ReportTrafficVisible',
  ForceTrafficRefresh: 'ForceTrafficRefresh',
  WakeScreen: 'WakeScreen',
} as const

/** Вызов без ожидания результата; без связи — тихо пропускается (после реконнекта эффект видимости повторит пинг). */
function invokeIfConnected(method: string): void {
  if (connection.state !== HubConnectionState.Connected) return
  connection.invoke(method).catch((error: unknown) => console.warn(`[signalr] ${method} failed`, error))
}

/** Виджет пробок на экране — сервер не даст TrafficWorker уснуть (и разбудит спящий). */
export const reportTrafficVisible = (): void => invokeIfConnected(HubMethods.ReportTrafficVisible)

/** Данные пробок устарели — попросить сервер обновить сейчас (сервер ограничивает частоту). */
export const forceTrafficRefresh = (): void => invokeIfConnected(HubMethods.ForceTrafficRefresh)

/** Касание чёрного экрана ночью: сервер переводит Sleep → Dimmed на 5 минут (PowerModeChanged придёт следом). */
export const wakeScreen = (): void => invokeIfConnected(HubMethods.WakeScreen)

let started = false

/** Запускает единственное соединение приложения. Повторные вызовы игнорируются (StrictMode). */
export function startDashboardConnection(): void {
  if (started) return
  started = true
  bindEvents()
  window.addEventListener('online', () => void startWithRetry())
  void startWithRetry()
}
