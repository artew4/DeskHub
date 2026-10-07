import { Clock, Droplets, MapPin, Sun } from 'lucide-react'
import { memo } from 'react'
import { useDashboardStore } from '../../store/useDashboardStore'
import type { HourlyForecast, WeatherModel } from '../../types/dashboard'
import { useClock } from '../dashboard/clock/useClock'
import {
  WEATHER_STALE_AFTER_MS,
  formatHour,
  formatPrecipitation,
  formatTemperature,
  minutesSince,
  selectForecast,
  uvCategory,
} from './weather.mappers'
import { WeatherIcon } from './weatherIcons'

const HOURLY_COUNT = 5

export const WeatherWidget = memo(function WeatherWidget() {
  const weather = useDashboardStore((s) => s.weather)
  // Раз в минуту: сдвигает почасовой прогноз и пересчитывает «устаревание» без новых данных с сервера
  const now = useClock('minute')

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-card bg-surface-1 p-4">
      {weather ? <WeatherContent weather={weather} now={now} /> : <WeatherSkeleton />}
    </section>
  )
})

function WeatherContent({ weather, now }: { weather: WeatherModel; now: Date }) {
  const isStale = now.getTime() - Date.parse(weather.updatedAt) > WEATHER_STALE_AFTER_MS
  const forecast = selectForecast(weather.hourly, now, HOURLY_COUNT)
  const uv = uvCategory(weather.uvIndex)

  return (
    <div className={`flex h-full flex-col transition-opacity duration-300 ${isStale ? 'opacity-60' : ''}`}>
      <header className="flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-1.5 text-label font-semibold uppercase text-fg-secondary">
          <MapPin className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{weather.locationName}</span>
        </h2>
        {isStale ? (
          <span className="flex shrink-0 items-center gap-1 text-label text-status-warn">
            <Clock className="size-4" aria-hidden />
            {minutesSince(weather.updatedAt, now)} мин назад
          </span>
        ) : (
          <span className="truncate text-label text-fg-secondary">{weather.description}</span>
        )}
      </header>

      <div className="mt-3 flex flex-1 items-center gap-4">
        <WeatherIcon icon={weather.icon} className="size-16 shrink-0" strokeWidth={1.5} />
        <span className="text-hero font-semibold tabular-nums">{formatTemperature(weather.temperature)}</span>

        <dl className="ml-auto flex flex-col gap-1.5 text-label text-fg-secondary">
          <div>
            ощущается <span className="tabular-nums text-fg-primary">{formatTemperature(weather.apparentTemperature)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Droplets className="size-4 text-sky-400" aria-hidden />
            <span className="tabular-nums text-fg-primary">{formatPrecipitation(weather.precipitation)}</span>
          </div>
          {/* УФ ночью всегда 0 — не показываем */}
          {weather.isDay && (
            <div className="flex items-center gap-1.5">
              <Sun className="size-4 text-amber-300" aria-hidden />
              <span>
                УФ <span className={`font-semibold tabular-nums ${uv.className}`}>{Math.round(weather.uvIndex)}</span>
              </span>
            </div>
          )}
        </dl>
      </div>

      <div className="mt-3 border-t border-surface-2 pt-2">
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{forecast.title}</h3>
        {forecast.hours.length > 0 ? (
          // Если часов меньше 5 (поздний вечер, неполные данные) — распределяем равномерно, а не по краям
          <ul className={`flex ${forecast.hours.length === HOURLY_COUNT ? 'justify-between' : 'justify-around'}`}>
            {forecast.hours.map((hour) => (
              <HourItem key={hour.time} hour={hour} />
            ))}
          </ul>
        ) : (
          <p className="flex h-[76px] items-center justify-center text-label text-fg-muted">Нет прогноза</p>
        )}
      </div>
    </div>
  )
}

function HourItem({ hour }: { hour: HourlyForecast }) {
  return (
    <li className="flex w-14 flex-col items-center gap-1.5">
      <span className="text-label tabular-nums text-fg-secondary">{formatHour(hour.time)}</span>
      <WeatherIcon icon={hour.icon} className="size-6" strokeWidth={1.75} />
      <span className="text-base font-semibold tabular-nums">{formatTemperature(hour.temperature)}</span>
      {/* Место под вероятность осадков резервируется всегда, чтобы строки не прыгали */}
      <span className="h-3 text-[11px] leading-3 tabular-nums text-sky-400">
        {hour.precipitationProbability >= 30 ? `${hour.precipitationProbability}%` : ''}
      </span>
    </li>
  )
}

/** Повторяет раскладку контента, чтобы при приходе данных не было «прыжка». */
function WeatherSkeleton() {
  return (
    <div className="flex h-full animate-pulse flex-col" aria-label="Загрузка погоды">
      <div className="flex justify-between">
        <div className="h-4 w-24 rounded bg-surface-2" />
        <div className="h-4 w-20 rounded bg-surface-2" />
      </div>
      <div className="mt-3 flex flex-1 items-center gap-4">
        <div className="size-16 rounded-full bg-surface-2" />
        <div className="h-14 w-28 rounded-lg bg-surface-2" />
        <div className="ml-auto flex flex-col gap-2">
          <div className="h-3.5 w-24 rounded bg-surface-2" />
          <div className="h-3.5 w-16 rounded bg-surface-2" />
        </div>
      </div>
      <div className="mt-3 flex justify-between border-t border-surface-2 pt-[30px]">
        {Array.from({ length: HOURLY_COUNT }, (_, i) => (
          <div key={i} className="h-[76px] w-14 rounded-lg bg-surface-2" />
        ))}
      </div>
    </div>
  )
}
