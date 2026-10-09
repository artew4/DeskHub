import { WidgetBoundary } from '../../components/WidgetBoundary'
import { CalendarWidget } from '../calendar/CalendarWidget'
import { ClockWidget } from '../clock/ClockWidget'
import { WeatherWidget } from '../weather/WeatherWidget'
import { BottomLeftCarousel } from './BottomLeftCarousel'

/**
 * Главный экран (индекс 0 карусели): сетка 12×6 на контентной области 992×568 (p-4, gap-4):
 * колонка 68 px, строка ≈ 81.3 px; ячейка 7×3 ≈ 572×276, 5×3 ≈ 404×276
 * (knowledge/Frontend_react/Feature_Dashboard.md, раздел 2).
 * Левая нижняя ячейка — вертикальная мини-карусель «Пробки ↔ Кот» (BottomLeftCarousel).
 */
export function MainScreen() {
  return (
    <main className="grid h-full grid-cols-12 grid-rows-6 gap-4 p-4">
      <div style={{ gridColumn: '1 / span 7', gridRow: '1 / span 3' }}>
        <WidgetBoundary name="clock">
          <ClockWidget />
        </WidgetBoundary>
      </div>
      <div style={{ gridColumn: '1 / span 7', gridRow: '4 / span 3' }}>
        <WidgetBoundary name="carousel">
          <BottomLeftCarousel />
        </WidgetBoundary>
      </div>
      <div style={{ gridColumn: '8 / span 5', gridRow: '1 / span 3' }}>
        <WidgetBoundary name="weather">
          <WeatherWidget />
        </WidgetBoundary>
      </div>
      <div style={{ gridColumn: '8 / span 5', gridRow: '4 / span 3' }}>
        <WidgetBoundary name="calendar">
          <CalendarWidget />
        </WidgetBoundary>
      </div>
    </main>
  )
}
