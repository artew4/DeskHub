import { CalendarWidget } from '../calendar/CalendarWidget'
import { ClockWidget } from '../clock/ClockWidget'
import { TamagotchiWidget } from '../tamagotchi/TamagotchiWidget'
import { TrafficWidget } from '../traffic/TrafficWidget'
import { useTrafficWindow } from '../traffic/useTrafficWindow'
import { WeatherWidget } from '../weather/WeatherWidget'

/**
 * Главный экран (индекс 0 карусели): сетка 12×6 на контентной области 1232×752 (p-6, gap-6):
 * колонка ≈ 80.7 px, строка ≈ 105.3 px; ячейка 7×3 ≈ 709×364, 5×3 ≈ 499×364
 * (knowledge/Frontend_react/Feature_Dashboard.md, раздел 2).
 * Левая нижняя ячейка: пробки в окне поездки (Пн–Пт 10:00–13:20), в остальное время — кот.
 */
export function MainScreen() {
  const showTraffic = useTrafficWindow()

  return (
    <main className="grid h-full grid-cols-12 grid-rows-6 gap-6 p-6">
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
