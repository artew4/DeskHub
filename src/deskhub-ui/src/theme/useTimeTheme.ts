import { useEffect } from 'react'
import { useClock } from '../features/clock/useClock'

export type TimeTheme = 'morning' | 'day' | 'evening' | 'night'

const THEME_CLASSES: Record<TimeTheme, string> = {
  morning: 'theme-morning',
  day: 'theme-day',
  evening: 'theme-evening',
  night: 'theme-night',
}

/** Утро 08–12, день 12–18, вечер 18–24, ночь 00–08 (локальное время устройства). */
export function themeForHour(hour: number): TimeTheme {
  if (hour >= 8 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'day'
  if (hour >= 18) return 'evening'
  return 'night'
}

/**
 * Вешает класс темы на <html>: CSS-переменные --bg-* / --text-* (src/index.css) меняют все токены
 * surface-* / fg-* разом. Пересчёт на границе минуты (useClock) — смена темы ровно в 08:00, 12:00, 18:00, 00:00.
 */
export function useTimeTheme(): TimeTheme {
  const theme = themeForHour(useClock('minute').getHours())

  useEffect(() => {
    const root = document.documentElement
    Object.values(THEME_CLASSES).forEach((c) => root.classList.remove(c))
    root.classList.add(THEME_CLASSES[theme])
  }, [theme])

  return theme
}
