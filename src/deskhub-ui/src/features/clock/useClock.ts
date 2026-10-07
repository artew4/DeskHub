import { useEffect, useState } from 'react'

/**
 * Текущее время, обновляемое точно на границе секунды/минуты (setTimeout с выравниванием,
 * без дрейфа setInterval). См. knowledge/Frontend_react/Feature_Dashboard.md, раздел 3.2.
 */
export function useClock(resolution: 'second' | 'minute' = 'second'): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const step = resolution === 'second' ? 1_000 : 60_000
    let timer: ReturnType<typeof setTimeout>

    const tick = () => {
      const current = new Date()
      setNow(current)
      // следующая граница + 5 мс запаса
      timer = setTimeout(tick, step - (current.getTime() % step) + 5)
    }

    timer = setTimeout(tick, step - (Date.now() % step) + 5)
    return () => clearTimeout(timer)
  }, [resolution])

  return now
}
