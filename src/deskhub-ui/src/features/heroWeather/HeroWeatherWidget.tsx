import { Sunrise, Sunset } from 'lucide-react'
import { memo, useLayoutEffect, useRef, useState } from 'react'
import { useDashboardStore } from '../../store/useDashboardStore'
import type { WeatherModel } from '../../types/dashboard'
import { useClock } from '../clock/useClock'
import { SkyClouds, SkyFog, SkyLightning, SkyPrecipitation, type SkySize } from '../sky/SkyEffects'
import { SKY_GRADIENT, isOvercast, skyFromWeatherIcon, type RoomPhase } from '../tamagotchi/roomEnvironment'
import { formatTemperature } from '../weather/weather.mappers'
import { celestialState, skyPhase, sunTimes } from './celestial'
import { CitySkyline } from './CitySkyline'
import { Moon, Stars, Sun } from './SkyBodies'

const PHASES: RoomPhase[] = ['morning', 'day', 'evening', 'night']
const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false })

/** Тень текста — читается и на светлом дневном небе, и на облаках (без backdrop-filter: дорого для GPU Pi). */
const TEXT_SHADOW = { textShadow: '0 1px 2px rgba(0,0,0,0.35), 0 2px 18px rgba(0,0,0,0.3)' }

/**
 * «Кинематографичная погода» — большая ячейка 7×3 (≈ 572×276) на месте кота в мини-карусели.
 * Слои снизу вверх: градиент неба (по солнцу, не по часам) → звёзды → солнце / луна на дуге → облака →
 * силуэт города → осадки, туман, молния → текст. Солнце и луна рисуются всегда — в пасмурную погоду их закрывают облака.
 * Обновление — раз в минуту (useClock('minute')); всё движение погоды — CSS keyframes из SkyEffects.
 */
export const HeroWeatherWidget = memo(function HeroWeatherWidget() {
  const weather = useDashboardStore((s) => s.weather)
  const now = useClock('minute')
  return <HeroWeatherScene weather={weather} now={now} />
})

/** Сцена без подписки на стор и часы — данные и время приходят пропсами (виджет выше; удобно и для проверки состояний). */
export function HeroWeatherScene({ weather, now }: { weather: WeatherModel | null; now: Date }) {
  const ref = useRef<HTMLElement>(null)
  const [area, setArea] = useState<SkySize>({ width: 572, height: 276 })

  // Размер ячейки — для пути облаков и ширины простыней осадков; 0×0 (скрыт в режиме сна) игнорируется
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width > 0 && height > 0) setArea((a) => (a.width === Math.round(width) && a.height === Math.round(height) ? a : { width: Math.round(width), height: Math.round(height) }))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const times = sunTimes(now, weather?.astronomy)
  const phase = skyPhase(now.getTime(), times)
  const sky = skyFromWeatherIcon(weather?.icon)
  const overcast = isOvercast(sky)
  const celestial = celestialState(now.getTime(), times)
  const hasAstronomy = !!weather?.astronomy?.sunrise && !!weather.astronomy.sunset

  return (
    <section
      ref={ref}
      className="theme-locked relative h-full overflow-hidden rounded-card bg-black text-white"
      aria-label={weather ? `Погода: ${formatTemperature(weather.temperature)}, ${weather.description}` : 'Погода загружается'}
    >
      {/* Небо: постоянный слой на каждую фазу и вариант (ясно / пасмурно) — смена кроссфейдом opacity за 3 с */}
      {PHASES.flatMap((p) =>
        (['clear', 'overcast'] as const).map((variant) => {
          const [top, bottom] = SKY_GRADIENT[p][variant]
          const active = p === phase && (variant === 'overcast') === overcast
          return (
            <div
              key={`${p}-${variant}`}
              className="absolute inset-0"
              style={{ background: `linear-gradient(${top}, ${bottom} 85%)`, opacity: active ? 1 : 0, transition: 'opacity 3s ease-in-out' }}
            />
          )
        }),
      )}

      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <Stars visible={phase === 'night' && !overcast} />
        <Sun progress={celestial.body === 'sun' ? celestial.progress : 0} visible={celestial.body === 'sun'} />
        <Moon
          progress={celestial.body === 'moon' ? celestial.progress : 0}
          visible={celestial.body === 'moon'}
          phase={weather?.astronomy?.moonPhase}
          illumination={weather?.astronomy?.moonIllumination}
        />
        <SkyClouds phase={phase} sky={sky} area={area} sizeScale={1.6} />
        <CitySkyline phase={phase} />
        <SkyFog phase={phase} sky={sky} />
        <SkyPrecipitation sky={sky} area={area} />
        <SkyLightning sky={sky} />
      </div>

      {/* Передний план: крупная минималистичная типографика */}
      <div className="relative flex h-full flex-col justify-between p-5" style={TEXT_SHADOW}>
        <header className="flex items-start justify-between">
          <span className="text-label font-semibold uppercase tracking-[0.12em] text-white/85">{weather?.locationName ?? 'Погода'}</span>
          {hasAstronomy && (
            <span className="flex items-center gap-3 rounded-full bg-black/15 px-3 py-1 text-label font-medium tabular-nums text-white/90">
              <span className="flex items-center gap-1">
                <Sunrise className="size-4" aria-hidden />
                {timeFormat.format(times.sunrise)}
              </span>
              <span className="flex items-center gap-1">
                <Sunset className="size-4" aria-hidden />
                {timeFormat.format(times.sunset)}
              </span>
            </span>
          )}
        </header>

        {weather ? (
          <div className="mb-6">
            <div className="text-[92px] font-extralight leading-[0.9] tracking-tight tabular-nums">{formatTemperature(weather.temperature)}</div>
            <div className="mt-2 text-xl font-medium">{weather.description}</div>
            <div className="text-label text-white/80">Ощущается как {formatTemperature(weather.apparentTemperature)}</div>
          </div>
        ) : (
          <div className="mb-6 text-xl font-light text-white/80">Ожидание данных…</div>
        )}
      </div>
    </section>
  )
}
