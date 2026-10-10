import { memo, useId, type ReactNode } from 'react'
import type { MoonPhase } from '../../types/dashboard'
import { arcPosition, moonLight, moonLitPath } from './celestial'

/** Позиция на дуге меняется раз в минуту — короткий переход, чтобы светило не «прыгало». */
const MOVE = 'transform 1.5s ease-in-out, opacity 3s ease-in-out'

/**
 * Обёртка во всю площадь неба, сдвинутая на (x %, y %) — проценты translate считаются от её собственного размера,
 * то есть от размера виджета; светило стоит в её левом верхнем углу (центрировано). Только transform — композиция на GPU.
 */
function ArcPlacement({ progress, visible, children }: { progress: number; visible: boolean; children: ReactNode }) {
  const { x, y } = arcPosition(progress)
  return (
    <div className="absolute inset-0 will-change-transform" style={{ transform: `translate3d(${x}%, ${y}%, 0)`, opacity: visible ? 1 : 0, transition: MOVE }}>
      <div className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2">{children}</div>
    </div>
  )
}

/** Солнце: у горизонта — крупнее и оранжевее, в зените — бело-жёлтое; мягкий ореол — radial-gradient. */
export const Sun = memo(function Sun({ progress, visible }: { progress: number; visible: boolean }) {
  const { elevation } = arcPosition(progress)
  const low = elevation < 0.3
  const core = low ? '#FFB463' : '#FFE9A3'
  const glow = low ? 'rgba(255, 150, 70, 0.45)' : 'rgba(255, 236, 170, 0.5)'
  return (
    <ArcPlacement progress={progress} visible={visible}>
      <div className="relative size-[110px]">
        <div className="absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle, ${glow} 0%, transparent 65%)`, transition: 'background 3s' }} />
        <div className="absolute left-1/2 top-1/2 size-[38px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: core, boxShadow: `0 0 24px ${glow}`, transition: 'background 3s' }} />
      </div>
    </ArcPlacement>
  )
})

const MOON_R = 17

/**
 * Луна с реальной фазой: SVG-маска. Белая (видимая) часть маски — контур освещённой доли диска (moonLitPath):
 * правая полуокружность + полуэллипс-терминатор; убывающая луна — та же маска, отражённая по горизонтали.
 * Под маской — яркий диск с кратерами, без маски — тёмный «пепельный» диск (видна вся луна, как в реальности).
 */
export const Moon = memo(function Moon({ progress, visible, phase, illumination }: { progress: number; visible: boolean; phase?: MoonPhase; illumination?: number }) {
  const maskId = `moon-${useId().replace(/:/g, '')}`
  const { fraction, waxing } = moonLight(phase, illumination)
  const size = MOON_R * 2 + 40
  return (
    <ArcPlacement progress={progress} visible={visible}>
      <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} aria-hidden>
        <defs>
          <radialGradient id={`${maskId}-glow`}>
            <stop offset="0.4" stopColor="#F4E9C8" stopOpacity={0.12 + 0.2 * fraction} />
            <stop offset="1" stopColor="#F4E9C8" stopOpacity={0} />
          </radialGradient>
          <mask id={maskId}>
            <rect x={-size / 2} y={-size / 2} width={size} height={size} fill="black" />
            <path d={moonLitPath(MOON_R, fraction)} fill="white" transform={waxing ? undefined : 'scale(-1 1)'} />
          </mask>
        </defs>
        <circle r={size / 2} fill={`url(#${maskId}-glow)`} />
        {/* Пепельный свет — неосвещённая часть диска */}
        <circle r={MOON_R} fill="#3A4560" opacity={0.55} />
        <g mask={`url(#${maskId})`}>
          <circle r={MOON_R} fill="#F4E9C8" />
          <circle cx={-5} cy={-4} r={3.2} fill="#DCCFAE" />
          <circle cx={6} cy={5} r={2.4} fill="#DCCFAE" />
          <circle cx={2} cy={-9} r={1.6} fill="#DCCFAE" />
          <circle cx={-7} cy={8} r={1.8} fill="#DCCFAE" />
        </g>
      </svg>
    </ArcPlacement>
  )
})

const STARS: [number, number, number][] = [
  [8, 12, 0], [17, 30, 1.4], [26, 9, 0.7], [37, 22, 2.1], [46, 6, 1.1], [58, 17, 0.3], [64, 33, 1.8], [73, 8, 2.6], [82, 24, 0.9], [91, 13, 1.6], [12, 44, 2.3], [52, 40, 0.5], [87, 42, 1.2],
]

/** Звёзды — только ясной ночью; мерцание opacity. */
export function Stars({ visible }: { visible: boolean }) {
  return (
    <div className="absolute inset-0" style={{ opacity: visible ? 1 : 0, transition: 'opacity 3s ease-in-out' }}>
      {STARS.map(([x, y, delay]) => (
        <span
          key={`${x}-${y}`}
          className="absolute size-[2px] rounded-full bg-white motion-safe:animate-twinkle"
          style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${delay}s` }}
        />
      ))}
    </div>
  )
}
