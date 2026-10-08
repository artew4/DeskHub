import { CalendarWidget } from '../calendar/CalendarWidget'
import { ClockWidget } from '../clock/ClockWidget'
import { TamagotchiWidget } from '../tamagotchi/TamagotchiWidget'
import { TrafficWidget } from '../traffic/TrafficWidget'
import { useTrafficWindow } from '../traffic/useTrafficWindow'
import { WeatherWidget } from '../weather/WeatherWidget'

/**
 * Главный экран (индекс 0 карусели): сетка 12×6 на контентной области 992×568 (p-4, gap-4):
 * колонка 68 px, строка ≈ 81.3 px; ячейка 7×3 ≈ 572×276, 5×3 ≈ 404×276
 * (knowledge/Frontend_react/Feature_Dashboard.md, раздел 2).
 * Левая нижняя ячейка: пробки в окне поездки (Пн–Пт 10:00–13:20), в остальное время — кот.
 */
export function MainScreen() {
  const showTraffic = useTrafficWindow()

  return (
    <main className="grid h-full grid-cols-12 grid-rows-6 gap-4 p-4">
      <div style={{ gridColumn: '1 / span 7', gridRow: '1 / span 3' }}>
        <ClockWidget />
      </div>
      <div style={{ gridColumn: '1 / span 7', gridRow: '4 / span 3' }}>
        {/* key — чтобы при смене виджета сработало плавное появление */}
        <div key={showTraffic ? 'traffic' : 'cat'} className="h-full motion-safe:animate-fade-in">
          {showTraffic ? <TrafficWidget /> : <TamagotchiWidget />}
        </div>
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
