import { ClockWidget } from '../clock/ClockWidget'
import { TelemetryWidget } from '../telemetry/TelemetryWidget'
import { WeatherWidget } from '../weather/WeatherWidget'

/**
 * Главный экран: сетка 12×6 на контентной области 992×568
 * (knowledge/Frontend_react/Feature_Dashboard.md, раздел 2).
 * Ячейки по раскладке из документации; пробки (кол. 1–7, стр. 4–6) — следующий этап.
 */
export function DashboardScreen() {
  return (
    <main className="grid h-full grid-cols-12 grid-rows-6 gap-3">
      <div style={{ gridColumn: '1 / span 7', gridRow: '1 / span 3' }}>
        <ClockWidget />
      </div>
      <div style={{ gridColumn: '8 / span 5', gridRow: '1 / span 3' }}>
        <WeatherWidget />
      </div>
      <div style={{ gridColumn: '8 / span 5', gridRow: '4 / span 3' }}>
        <TelemetryWidget />
      </div>
    </main>
  )
}
