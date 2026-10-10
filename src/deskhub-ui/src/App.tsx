import { useEffect } from 'react'
import { BrightnessOverlay } from './components/BrightnessOverlay'
import { NightShiftOverlay } from './components/NightShiftOverlay'
import { PowerOverlay } from './components/PowerOverlay'
import { SpacedeskViewer } from './components/SpacedeskViewer'
import { ScreenCarousel } from './components/ScreenCarousel'
import { MainScreen } from './features/dashboard/MainScreen'
import { SystemScreen } from './features/dashboard/SystemScreen'
import { startDashboardConnection } from './services/signalrConnection'
import { useDashboardStore } from './store/useDashboardStore'
import { useTimeTheme } from './theme/useTimeTheme'

function App() {
  useEffect(() => {
    startDashboardConnection()
  }, [])

  // Тема по времени суток (или всегда светлая — настройка «Светлая тема»): класс на <html>, цвета — CSS-переменные (src/index.css)
  useTimeTheme()

  // В режиме sleep интерфейс скрыт (display: none): под чёрным экраном не крутятся CSS-анимации кота и прочее
  const asleep = useDashboardStore((s) => s.powerMode === 'sleep')

  // Отступ p-4 — внутри каждого экрана, чтобы при свайпе экраны уезжали целиком до края дисплея
  return (
    <div className="relative w-[1024px] h-[600px] overflow-hidden bg-surface-0 text-fg-primary font-sans select-none">
      <div className={`h-full w-full ${asleep ? 'hidden' : ''}`}>
        <ScreenCarousel>
          <MainScreen />
          <SystemScreen />
        </ScreenCarousel>
      </div>
      <NightShiftOverlay />
      <BrightnessOverlay />
      <PowerOverlay />
      <SpacedeskViewer />
    </div>
  )
}

export default App
