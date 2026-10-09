import { useEffect } from 'react'
import { useClock } from '../features/clock/useClock'
import { useDisplaySettingsStore } from '../store/useDisplaySettingsStore'

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
 * Настройка «Светлая тема» (forceLightTheme) — всегда дневная тема, независимо от времени
 * (вместе с ней и вариант light: — иконки погоды и пр. в светлых цветах). Комната кота — theme-locked, не меняется.
 */
export function useTimeTheme(): TimeTheme {
  const forceLight = useDisplaySettingsStore((s) => s.forceLightTheme)
  const byTime = themeForHour(useClock('minute').getHours())
  const theme: TimeTheme = forceLight ? 'day' : byTime

  useEffect(() => {
    const root = document.documentElement
    Object.values(THEME_CLASSES).forEach((c) => root.classList.remove(c))
    root.classList.add(THEME_CLASSES[theme])
  }, [theme])

  return theme
}
