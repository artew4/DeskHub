import { memo, type CSSProperties } from 'react'
import type { RoomLayout } from './catStates'
import { LAMP_X, WINDOW, cloudColor, hasPrecipitation, isOvercast, type RoomPhase, type SkyCondition } from './roomEnvironment'

// ─── Погода за окном ─────────────────────────────────────────────────────────
// HTML-слой ровно поверх стекла окна (WINDOW.glass в координатах комнаты). Всё движение — CSS keyframes
// на transform/opacity отдельных слоёв (will-change: transform → композиция на GPU, SVG комнаты не перерисовывается).
// Дождь и снег — не сотни частиц, а одна «простыня» с повторяющимся SVG-узором, которая за цикл сдвигается
// ровно на период плитки: бесшовно и дёшево.

const GLASS = WINDOW.glass

const FOG_HAZE: Record<RoomPhase, string> = {
  morning: 'rgba(214, 208, 204, 0.55)',
  day: 'rgba(205, 210, 220, 0.55)',
  evening: 'rgba(120, 100, 110, 0.5)',
  night: 'rgba(40, 47, 62, 0.65)',
}

const svgTile = (w: number, h: number, body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${body}</svg>`)}")`

/** Плитка дождя: штрихи с наклоном −0.6 (dx/dy) — слой сдвигается на (−w, h) с тем же наклоном → косые капли по ветру. */
function rainTile(w: number, h: number, color: string): string {
  const k = w / h
  const streak = (x: number, y: number, len: number) => `<line x1='${x}' y1='${y}' x2='${(x - k * len).toFixed(1)}' y2='${y + len}' stroke='${color}' stroke-width='1.1' stroke-linecap='round'/>`
  return svgTile(w, h, streak(w * 0.7, h * 0.05, h * 0.22) + streak(w * 0.3, h * 0.55, h * 0.22))
}

function snowTile(size: number, r: number): string {
  const flakes = [[0.2, 0.15], [0.7, 0.3], [0.45, 0.6], [0.9, 0.8], [0.1, 0.85]]
    .map(([x, y], i) => `<circle cx='${x * size}' cy='${y * size}' r='${(r * (0.7 + (i % 3) * 0.2)).toFixed(2)}' fill='white' opacity='0.85'/>`)
    .join('')
  return svgTile(size, size, flakes)
}

interface PrecipLayerProps {
  tile: string
  w: number
  h: number
  dx: number
  durationS: number
  opacity: number
  className: string
}

/** Простыня осадков: шире и выше стекла на одну плитку, сдвигается на (dx, h) за цикл. */
function PrecipLayer({ tile, w, h, dx, durationS, opacity, className }: PrecipLayerProps) {
  const style = {
    left: dx < 0 ? 0 : -w,
    top: -h,
    width: GLASS.width + w,
    height: GLASS.height + h,
    backgroundImage: tile,
    backgroundSize: `${w}px ${h}px`,
    opacity,
    animationDuration: `${durationS}s`,
    '--dx': `${dx}px`,
    '--dy': `${h}px`,
  } as CSSProperties
  return <div className={`absolute will-change-transform ${className}`} style={style} />
}

function Cloud({ y, scale, color, durationS, delayS, opacity }: { y: number; scale: number; color: string; durationS: number; delayS: number; opacity: number }) {
  return (
    <div
      className="absolute left-0 will-change-transform motion-safe:animate-cloud-drift"
      style={{ top: y, opacity, animationDuration: `${durationS}s`, animationDelay: `${-delayS}s` }}
    >
      <svg width={56 * scale} height={24 * scale} viewBox="0 0 56 24">
        <g style={{ fill: color, transition: 'fill 3s ease-in-out' }}>
          <circle cx={16} cy={15} r={9} />
          <circle cx={29} cy={10} r={10} />
          <circle cx={41} cy={15} r={8} />
          <rect x={10} y={14} width={38} height={10} rx={5} />
        </g>
      </svg>
    </div>
  )
}

/** Облака, туман, дождь, снег, молния — по реальной погоде (wttr.in → WeatherModel.icon). */
export const WindowWeather = memo(function WindowWeather({ phase, sky, layout }: { phase: RoomPhase; sky: SkyCondition; layout: RoomLayout }) {
  const color = cloudColor(phase, sky)
  const heavy = isOvercast(sky)
  const rain = sky === 'drizzle' || sky === 'rain' || sky === 'sleet' || sky === 'storm'
  const snow = sky === 'snow' || sky === 'sleet'

  return (
    <div
      className="pointer-events-none absolute overflow-hidden"
      style={{ left: GLASS.x, top: GLASS.y + layout.verticalShift, width: GLASS.width, height: GLASS.height }}
      aria-hidden
    >
      {/* Пелена туч / тумана */}
      {heavy && <div className="absolute inset-x-0 top-0 h-2/3" style={{ background: `linear-gradient(${color}cc, ${color}00)` }} />}

      {/* Облака — в верхней части окна, над силуэтом города */}
      {sky !== 'clear' &&
        (heavy
          ? [
              { y: -6, scale: 2.0, durationS: 62, delayS: 5 },
              { y: 14, scale: 1.7, durationS: 78, delayS: 40 },
              { y: 32, scale: 2.1, durationS: 70, delayS: 22 },
              { y: 4, scale: 1.5, durationS: 92, delayS: 70 },
              { y: 46, scale: 1.4, durationS: 84, delayS: 55 },
            ]
          : [
              { y: 10, scale: 1.3, durationS: 84, delayS: 15 },
              { y: 38, scale: 1.0, durationS: 110, delayS: 60 },
            ]
        ).map((c, i) => <Cloud key={i} {...c} color={color} opacity={heavy ? 0.95 : 0.85} />)}

      {/* Туман — поверх облаков (смягчает их), цвет дымки по фазе суток */}
      {sky === 'fog' && <div className="absolute inset-0" style={{ background: FOG_HAZE[phase] }} />}

      {/* Осадки проявляются плавно (fade-in), а не возникают мгновенно */}
      {/* Дождь: дальний слой мельче и медленнее, ближний — крупнее и быстрее; морось — только дальний */}
      {rain && (
        <div className="absolute inset-0 motion-safe:animate-fade-in" style={{ animationDuration: '3s' }}>
        <PrecipLayer tile={rainTile(20, 34, 'rgba(190,210,240,0.55)')} w={20} h={34} dx={-20} durationS={sky === 'drizzle' ? 1.1 : 0.75} opacity={sky === 'drizzle' ? 0.6 : 0.8} className="motion-safe:animate-precip-fall" />
        </div>
      )}
      {rain && sky !== 'drizzle' && (
        <PrecipLayer tile={rainTile(30, 50, 'rgba(210,225,250,0.7)')} w={30} h={50} dx={-30} durationS={sky === 'storm' ? 0.38 : 0.5} opacity={0.9} className="motion-safe:animate-precip-fall" />
      )}

      {/* Снег: медленное падение + покачивание всей простыни */}
      {snow && (
        <div className="absolute inset-0 motion-safe:animate-fade-in" style={{ animationDuration: '3s' }}>
        <div className="absolute inset-0 motion-safe:animate-snow-sway">
          <PrecipLayer tile={snowTile(26, 1.1)} w={26} h={26} dx={0} durationS={9} opacity={0.7} className="motion-safe:animate-precip-fall" />
          <PrecipLayer tile={snowTile(40, 1.7)} w={40} h={40} dx={0} durationS={6} opacity={0.95} className="motion-safe:animate-precip-fall" />
        </div>
        </div>
      )}

      {/* Гроза: редкие двойные вспышки */}
      {sky === 'storm' && <div className="absolute inset-0 bg-white motion-safe:animate-lightning" style={{ opacity: 0 }} />}
    </div>
  )
})

// ─── Освещение комнаты ───────────────────────────────────────────────────────

/**
 * Слой освещения между комнатой и котом: затемняет/тонирует комнату (и кружку, и клубок), но не кота —
 * он рисуется поверх и остаётся читаемым. Меняется 4 раза в сутки — плавным кроссфейдом за 3 с.
 * Ночью — тёмная виньетка с «пятном» света под лампой; в пасмурную/дождливую погоду днём — лёгкая серость.
 */
export const RoomLighting = memo(function RoomLighting({ phase, sky, layout }: { phase: RoomPhase; sky: SkyCondition; layout: RoomLayout }) {
  const lampX = LAMP_X + layout.centerShift
  const lampY = layout.floorTop - 30
  const gloom = (isOvercast(sky) || hasPrecipitation(sky)) && (phase === 'morning' || phase === 'day')

  // Градиенты не анимируются transition'ом, поэтому каждая фаза — свой постоянный слой,
  // а смена фазы — плавный кроссфейд opacity за 3 с (композиция на GPU, без перерисовки)
  // База комнаты светлая: утро и день — свет из окна (тёплый / нейтральный), без затемнения;
  // вечер и ночь — уютный полумрак плотнее прежнего, со светлым пятном под лампой
  const phaseLayers: Record<RoomPhase, string | null> = {
    morning: 'linear-gradient(100deg, rgba(255,214,170,0.24), rgba(255,214,170,0.05) 65%)',
    day: 'linear-gradient(100deg, rgba(255,255,240,0.14), rgba(255,255,240,0) 60%)',
    evening: `radial-gradient(ellipse 220px 240px at ${lampX}px ${lampY}px, rgba(255,170,90,0.12), rgba(58,28,48,0.52) 90%)`,
    night: `radial-gradient(ellipse 160px 210px at ${lampX}px ${lampY}px, rgba(255,196,110,0.10), rgba(8,10,24,0.80) 85%)`,
  }

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {(Object.keys(phaseLayers) as RoomPhase[]).map((p) =>
        phaseLayers[p] ? (
          <div
            key={p}
            className="absolute inset-0"
            style={{ background: phaseLayers[p]!, opacity: p === phase ? 1 : 0, transition: 'opacity 3s ease-in-out' }}
          />
        ) : null,
      )}
      <div className="absolute inset-0" style={{ background: 'rgba(70,80,95,0.16)', opacity: gloom ? 1 : 0, transition: 'opacity 3s ease-in-out' }} />
    </div>
  )
})
