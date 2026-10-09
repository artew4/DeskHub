import { Clock, Cpu, MemoryStick, Thermometer, WifiOff } from 'lucide-react'
import { memo, type ReactNode } from 'react'
import { useDashboardStore } from '../../store/useDashboardStore'
import {
  formatUptime,
  levelBg,
  levelText,
  loadLevel,
  mbToGb,
  temperatureLevel,
  type StatusLevel,
} from './telemetry.mappers'
import { DisplayControls } from './DisplayControls'

export const TelemetryWidget = memo(function TelemetryWidget() {
  const telemetry = useDashboardStore((s) => s.telemetry)
  const isConnected = useDashboardStore((s) => s.isConnected)

  return (
    <section className="relative flex h-full flex-col overflow-hidden rounded-card bg-surface-1 p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-label font-semibold uppercase text-fg-secondary">Система</h2>
        {/* Низ карточки занят блоком управления — статус связи в шапке вместо аптайма */}
        {!isConnected && telemetry ? (
          <span className="flex items-center gap-1 text-label text-status-warn">
            <WifiOff className="size-4" aria-hidden />
            нет связи
          </span>
        ) : telemetry && (
          <span className="flex items-center gap-1.5 text-label tabular-nums text-fg-secondary">
            <Clock className="size-4" aria-hidden />
            {formatUptime(telemetry.uptimeSeconds)}
          </span>
        )}
      </header>

      {telemetry ? (
        <div
          className={`flex flex-1 flex-col justify-between transition-opacity duration-300 ${isConnected ? '' : 'opacity-50'}`}
        >
          <MetricRow
            icon={<Cpu className="size-5" aria-hidden />}
            label="CPU"
            value={`${Math.round(telemetry.cpuPercent)}%`}
            level={loadLevel(telemetry.cpuPercent)}
            fraction={telemetry.cpuPercent / 100}
          />
          <MetricRow
            icon={<MemoryStick className="size-5" aria-hidden />}
            label="RAM"
            value={`${mbToGb(telemetry.ramUsedMb)} / ${mbToGb(telemetry.ramTotalMb)} ГБ`}
            level={loadLevel((telemetry.ramUsedMb / telemetry.ramTotalMb) * 100)}
            fraction={telemetry.ramUsedMb / telemetry.ramTotalMb}
          />
          <TemperatureRow celsius={telemetry.temperatureC} />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-label text-fg-muted">Ожидание данных…</div>
      )}

      {/* Яркость и сон — работают и без телеметрии/связи */}
      <DisplayControls />
    </section>
  )
})

interface MetricRowProps {
  icon: ReactNode
  label: string
  value: string
  level: StatusLevel
  fraction: number
}

function MetricRow({ icon, label, value, level, fraction }: MetricRowProps) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="flex items-center gap-2 text-label font-medium text-fg-secondary">
          {icon}
          {label}
        </span>
        <span className={`text-2xl font-semibold tabular-nums ${levelText[level]}`}>{value}</span>
      </div>
      <ProgressBar fraction={fraction} level={level} />
    </div>
  )
}

function TemperatureRow({ celsius }: { celsius: number | null }) {
  const level = celsius == null ? null : temperatureLevel(celsius)
  return (
    <div className="flex items-baseline justify-between">
      <span className="flex items-center gap-2 text-label font-medium text-fg-secondary">
        <Thermometer className="size-5" aria-hidden />
        Температура
      </span>
      <span className={`text-value font-semibold tabular-nums ${level ? levelText[level] : 'text-fg-muted'}`}>
        {celsius == null ? '—' : `${Math.round(celsius)}°C`}
      </span>
    </div>
  )
}

/** Ширина задаётся через transform: scaleX — анимация на композиторе, без reflow. */
function ProgressBar({ fraction, level }: { fraction: number; level: StatusLevel }) {
  const clamped = Math.min(1, Math.max(0, fraction))
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
      <div
        className={`h-full origin-left rounded-full transition-transform duration-500 ease-kiosk ${levelBg[level]}`}
        style={{ transform: `scaleX(${clamped})` }}
      />
    </div>
  )
}
