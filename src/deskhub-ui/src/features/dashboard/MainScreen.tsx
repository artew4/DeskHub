import { CalendarWidget } from '../calendar/CalendarWidget'
import { ClockWidget } from '../clock/ClockWidget'
import { TrafficWidget } from '../traffic/TrafficWidget'
import { WeatherWidget } from '../weather/WeatherWidget'

/**
 * Главный экран (индекс 0 карусели): сетка 12×6 на контентной области 992×568
 * (knowledge/Frontend_react/Feature_Dashboard.md, раздел 2).
 */
export function MainScreen() {
  return (
    <main className="grid h-full grid-cols-12 grid-rows-6 gap-3 p-4">
      <div style={{ gridColumn: '1 / span 7', gridRow: '1 / span 3' }}>
        <ClockWidget />
      </div>
      <div style={{ gridColumn: '1 / span 7', gridRow: '4 / span 3' }}>
        <TrafficWidget />
      </div>
      <div style={{ gridColumn: '8 / span 5', gridRow: '1 / span 3' }}>
        <WeatherWidget />
      </div>
      <div style={{ gridColumn: '8 / span 5', gridRow: '4 / span 3' }}>
        <CalendarWidget />
      </div>
    </main>
  )
}
