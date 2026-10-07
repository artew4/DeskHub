import { useEffect } from 'react'
import { DashboardScreen } from './features/dashboard/DashboardScreen'
import { startDashboardConnection } from './services/signalrConnection'

function App() {
  useEffect(() => {
    startDashboardConnection()
  }, [])

  return (
    <div className="w-[1024px] h-[600px] overflow-hidden bg-black text-white p-4 font-sans select-none">
      <DashboardScreen />
    </div>
  )
}

export default App
