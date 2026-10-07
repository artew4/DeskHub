import { useEffect } from 'react'
import { startDashboardConnection } from './services/signalrConnection'

function App() {
  useEffect(() => {
    startDashboardConnection()
  }, [])

  return <div className="w-[1024px] h-[600px] overflow-hidden bg-black text-white"></div>
}

export default App
