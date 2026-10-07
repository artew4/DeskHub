import { Clock } from 'lucide-react'
import { memo } from 'react'
import { useDashboardStore } from '../../store/useDashboardStore'
import type { TrafficModel } from '../../types/dashboard'
import { useClock } from '../clock/useClock'
import { RouteMap, RouteMapSkeleton } from './RouteMap'
import { TRAFFIC_STALE_AFTER_MS, fastestRoute } from './traffic.mappers'

export const TrafficWidget = memo(function TrafficWidget() {
  const traffic = useDashboardStore((s) => s.traffic)
  const now = useClock('minute') // для пометки устаревших данных

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-card bg-surface-1 p-4">
      {traffic ? <TrafficContent traffic={traffic} now={now} /> : <TrafficSkeleton />}
    </section>
  )
})

function TrafficContent({ traffic, now }: { traffic: TrafficModel; now: Date }) {
  const ageMs = now.getTime() - Date.parse(traffic.updatedAt)
  const isStale = ageMs > TRAFFIC_STALE_AFTER_MS
  const fastest = fastestRoute(traffic.routes)

  return (
    <div className={`flex h-full flex-col transition-opacity duration-300 ${isStale ? 'opacity-60' : ''}`}>
      <header className="flex items-center justify-between gap-3">
        <h2 className="shrink-0 text-label font-semibold uppercase text-fg-secondary">
          {traffic.originName} → {traffic.destinationName}
        </h2>
        {isStale ? (
          <span className="flex shrink-0 items-center gap-1 text-label text-status-warn">
            <Clock className="size-4" aria-hidden />
            {Math.floor(ageMs / 60_000)} мин назад
          </span>
        ) : (
          <span className="truncate text-label text-fg-muted">
            {traffic.originAddress} — {traffic.destinationAddress}
          </span>
        )}
      </header>

      <div className="mt-2 min-h-0 flex-1">
        <RouteMap
          routes={traffic.routes}
          originName={traffic.originName}
          destinationName={traffic.destinationName}
          fastestId={fastest?.id ?? null}
          savesMinutes={fastest?.savesMinutes ?? 0}
        />
      </div>
    </div>
  )
}

function TrafficSkeleton() {
  return (
    <div className="flex h-full animate-pulse flex-col" aria-label="Загрузка маршрутов">
      <div className="flex justify-between">
        <div className="h-4 w-28 rounded bg-surface-2" />
        <div className="h-4 w-56 rounded bg-surface-2" />
      </div>
      <div className="mt-2 min-h-0 flex-1">
        <RouteMapSkeleton />
      </div>
    </div>
  )
}
