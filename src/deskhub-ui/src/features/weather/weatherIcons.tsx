import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react'
import { createElement } from 'react'

// Ключи иконок — контракт с бэкендом (src/DeskHub.Api/Services/Weather/WeatherCodes.cs)
const icons: Record<string, LucideIcon> = {
  'clear-day': Sun,
  'clear-night': Moon,
  'partly-cloudy-day': CloudSun,
  'partly-cloudy-night': CloudMoon,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  sleet: CloudHail,
  snow: CloudSnow,
  thunderstorm: CloudLightning,
}


// Цвета иконок: солнце тёплое, осадки холодные, остальное нейтральное; light: — насыщеннее для светлых тем
const iconColors: Record<string, string> = {
  'clear-day': 'text-amber-300 light:text-amber-500',
  'partly-cloudy-day': 'text-amber-200 light:text-amber-500',
  'clear-night': 'text-indigo-200 light:text-indigo-500',
  'partly-cloudy-night': 'text-indigo-200 light:text-indigo-500',
  drizzle: 'text-sky-300 light:text-sky-600',
  rain: 'text-sky-400 light:text-sky-600',
  sleet: 'text-sky-200 light:text-sky-500',
  snow: 'text-slate-100 light:text-slate-400',
  thunderstorm: 'text-violet-300 light:text-violet-600',
}

const iconColor = (key: string): string => iconColors[key] ?? 'text-fg-secondary'

interface WeatherIconProps extends Omit<LucideProps, 'ref'> {
  /** Ключ иконки от бэкенда («rain», «clear-day»…) */
  icon: string
}

/** Иконка погоды по ключу, с цветом по типу погоды. */
export function WeatherIcon({ icon, className = '', ...props }: WeatherIconProps) {
  return createElement(icons[icon] ?? Cloud, { ...props, className: `${iconColor(icon)} ${className}`, 'aria-hidden': true })
}
