import { ChevronsRight } from 'lucide-react'
import { TelemetryWidget } from '../telemetry/TelemetryWidget'

/**
 * Системный экран (индекс 1 карусели): та же сетка 12×6.
 * Возврат — свайпом вправо или автоматически через 30 с без касаний.
 */
export function SystemScreen() {
  return (
    <main className="grid h-full grid-cols-12 grid-rows-6 gap-4 p-4">
      <header className="col-span-12 flex items-center justify-between px-1" style={{ gridRow: '1 / span 1' }}>
        <h1 className="text-hero font-semibold tracking-tight text-fg-primary">Система</h1>
        <span className="flex items-center gap-1.5 text-label text-fg-muted">
          Проведите вправо, чтобы вернуться
          <ChevronsRight className="size-4" aria-hidden />
        </span>
      </header>
      <div style={{ gridColumn: '1 / span 5', gridRow: '2 / span 3' }}>
        <TelemetryWidget />
      </div>
    </main>
  )
}
