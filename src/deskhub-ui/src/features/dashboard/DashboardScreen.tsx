import { TelemetryWidget } from '../telemetry/TelemetryWidget'

/**
 * Главный экран: сетка 12×6 на контентной области 992×568
 * (knowledge/Frontend_react/Feature_Dashboard.md, раздел 2).
 * Пока размещён только виджет телеметрии — в своей целевой ячейке (кол. 8–12, стр. 4–6).
 */
export function DashboardScreen() {
  return (
    <main className="grid h-full grid-cols-12 grid-rows-6 gap-3">
      <div style={{ gridColumn: '8 / span 5', gridRow: '4 / span 3' }}>
        <TelemetryWidget />
      </div>
    </main>
  )
}
