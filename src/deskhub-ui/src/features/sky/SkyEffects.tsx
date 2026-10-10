import type { CSSProperties } from 'react'
import { cloudColor, isOvercast, type RoomPhase, type SkyCondition } from '../tamagotchi/roomEnvironment'

// ─── Погодные эффекты неба (общие для окна кота и Hero-виджета погоды) ────────────────────────
// Всё движение — CSS keyframes на transform/opacity отдельных слоёв (will-change: transform → композиция на GPU,
// фон не перерисовывается; никакого requestAnimationFrame). Дождь и снег — не сотни частиц, а одна «простыня»
// с повторяющимся SVG-узором, которая за цикл сдвигается ровно на период плитки: бесшовно и дёшево.
// Слои разнесены по компонентам, чтобы потребитель сам решал порядок: например, в Hero-виджете облака
// идут за силуэтом города, а дождь — перед ним.

/** Размер области неба, px — от него считаются ширина простыней осадков и путь облаков. */
export interface SkySize {
  width: number
  height: number
}

const FOG_HAZE: Record<RoomPhase, string> = {
  morning: 'rgba(214, 208, 204, 0.55)',
  day: 'rgba(205, 210, 220, 0.55)',
  evening: 'rgba(120, 100, 110, 0.5)',
  night: 'rgba(40, 47, 62, 0.65)',
}

const isRain = (sky: SkyCondition) => sky === 'drizzle' || sky === 'rain' || sky === 'sleet' || sky === 'storm'
const isSnow = (sky: SkyCondition) => sky === 'snow' || sky === 'sleet'

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
  area: SkySize
  tile: string
  w: number
  h: number
  dx: number
  durationS: number
  opacity: number
}

/** Простыня осадков: шире и выше области на одну плитку, сдвигается на (dx, h) за цикл. */
function PrecipLayer({ area, tile, w, h, dx, durationS, opacity }: PrecipLayerProps) {
  const style = {
    left: dx < 0 ? 0 : -w,
    top: -h,
    width: area.width + w,
    height: area.height + h,
    backgroundImage: tile,
    backgroundSize: `${w}px ${h}px`,
    opacity,
    animationDuration: `${durationS}s`,
    '--dx': `${dx}px`,
    '--dy': `${h}px`,
  } as CSSProperties
  return <div className="absolute will-change-transform motion-safe:animate-precip-fall" style={style} />
}

/** Базовая ширина облака (viewBox) и эталонный путь дрейфа окна кота (−130 → 240 px) — для пересчёта скорости. */
const CLOUD_W = 56
const REFERENCE_PATH_PX = 370

interface CloudSpec {
  /** Верх облака — доля высоты области. */
  y: number
  scale: number
  durationS: number
  delayS: number
}

const HEAVY_CLOUDS: CloudSpec[] = [
  { y: -0.04, scale: 2.0, durationS: 62, delayS: 5 },
  { y: 0.09, scale: 1.7, durationS: 78, delayS: 40 },
  { y: 0.21, scale: 2.1, durationS: 70, delayS: 22 },
  { y: 0.03, scale: 1.5, durationS: 92, delayS: 70 },
  { y: 0.3, scale: 1.4, durationS: 84, delayS: 55 },
]
const LIGHT_CLOUDS: CloudSpec[] = [
  { y: 0.06, scale: 1.3, durationS: 84, delayS: 15 },
  { y: 0.25, scale: 1.0, durationS: 110, delayS: 60 },
]

/**
 * Облако дрейфует слева направо через всю область: от −(своя ширина) до правого края (CSS-переменные
 * --drift-from / --drift-to в keyframe cloud-drift). Длительность растёт с длиной пути — скорость та же, что в окне кота.
 */
function Cloud({ spec, area, sizeScale, color, opacity }: { spec: CloudSpec; area: SkySize; sizeScale: number; color: string; opacity: number }) {
  const scale = spec.scale * sizeScale
  const width = CLOUD_W * scale
  const path = area.width + width
  const style = {
    top: spec.y * area.height,
    opacity,
    animationDuration: `${(spec.durationS * path) / REFERENCE_PATH_PX}s`,
    animationDelay: `${(-spec.delayS * path) / REFERENCE_PATH_PX}s`,
    '--drift-from': `${-width}px`,
    '--drift-to': `${area.width}px`,
  } as CSSProperties
  return (
    <div className="absolute left-0 will-change-transform motion-safe:animate-cloud-drift" style={style}>
      <svg width={width} height={24 * scale} viewBox="0 0 56 24">
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

/** Облака (2 светлых при переменной облачности или 5 тёмных туч) и пелена туч сверху. sizeScale — крупнее для большой области. */
export function SkyClouds({ phase, sky, area, sizeScale = 1 }: { phase: RoomPhase; sky: SkyCondition; area: SkySize; sizeScale?: number }) {
  if (sky === 'clear') return null
  const color = cloudColor(phase, sky)
  const heavy = isOvercast(sky)
  return (
    <>
      {heavy && <div className="absolute inset-x-0 top-0 h-2/3" style={{ background: `linear-gradient(${color}cc, ${color}00)` }} />}
      {(heavy ? HEAVY_CLOUDS : LIGHT_CLOUDS).map((spec, i) => (
        <Cloud key={i} spec={spec} area={area} sizeScale={sizeScale} color={color} opacity={heavy ? 0.95 : 0.85} />
      ))}
    </>
  )
}

/** Туман — дымка цвета фазы суток (ночью тёмная), поверх облаков. */
export function SkyFog({ phase, sky }: { phase: RoomPhase; sky: SkyCondition }) {
  return sky === 'fog' ? <div className="absolute inset-0" style={{ background: FOG_HAZE[phase] }} /> : null
}

/** Дождь (дальний + ближний слой; морось — только дальний) и снег (две простыни + покачивание); проявляются плавно. */
export function SkyPrecipitation({ sky, area }: { sky: SkyCondition; area: SkySize }) {
  const rain = isRain(sky)
  const snow = isSnow(sky)
  return (
    <>
      {rain && (
        <div className="absolute inset-0 motion-safe:animate-fade-in" style={{ animationDuration: '3s' }}>
          <PrecipLayer area={area} tile={rainTile(20, 34, 'rgba(190,210,240,0.55)')} w={20} h={34} dx={-20} durationS={sky === 'drizzle' ? 1.1 : 0.75} opacity={sky === 'drizzle' ? 0.6 : 0.8} />
          {sky !== 'drizzle' && (
            <PrecipLayer area={area} tile={rainTile(30, 50, 'rgba(210,225,250,0.7)')} w={30} h={50} dx={-30} durationS={sky === 'storm' ? 0.38 : 0.5} opacity={0.9} />
          )}
        </div>
      )}
      {snow && (
        <div className="absolute inset-0 motion-safe:animate-fade-in" style={{ animationDuration: '3s' }}>
          <div className="absolute inset-0 motion-safe:animate-snow-sway">
            <PrecipLayer area={area} tile={snowTile(26, 1.1)} w={26} h={26} dx={0} durationS={9} opacity={0.7} />
            <PrecipLayer area={area} tile={snowTile(40, 1.7)} w={40} h={40} dx={0} durationS={6} opacity={0.95} />
          </div>
        </div>
      )}
    </>
  )
}

/** Гроза: редкие двойные вспышки белого слоя. */
export function SkyLightning({ sky }: { sky: SkyCondition }) {
  return sky === 'storm' ? <div className="absolute inset-0 bg-white motion-safe:animate-lightning" style={{ opacity: 0 }} /> : null
}
