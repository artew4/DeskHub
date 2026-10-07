import { useEffect } from 'react'
import { ScreenCarousel } from './components/ScreenCarousel'
import { MainScreen } from './features/dashboard/MainScreen'
import { SystemScreen } from './features/dashboard/SystemScreen'
import { startDashboardConnection } from './services/signalrConnection'

function App() {
  useEffect(() => {
    startDashboardConnection()
  }, [])

  // Отступ p-4 — внутри каждого экрана, чтобы при свайпе экраны уезжали целиком до края дисплея
  return (
    <div className="w-[1024px] h-[600px] overflow-hidden bg-black text-white font-sans select-none">
      <ScreenCarousel>
        <MainScreen />
        <SystemScreen />
      </ScreenCarousel>
    </div>
  )
}

export default App
