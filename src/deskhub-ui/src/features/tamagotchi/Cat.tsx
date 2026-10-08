import { memo } from 'react'
import type { CatPose, Facing } from './catStates'

// Рыжий кот — самый заметный объект в тёмной комнате
const FUR = '#E39A5B'
const STRIPE = '#B8703A'
const CREAM = '#F3E3CF'
const EAR = '#F2A7A0'
const EYE = '#1B1F24'

/**
 * Векторный кот. Начало координат — точка между лапами (x = 0, y = 0), кот смотрит вправо;
 * разворот — scaleX(facing). Анимации (дыхание, хвост, лапы, моргание) — CSS keyframes
 * на transform; transform-box: fill-box задаёт точку вращения относительно самого элемента.
 */
export const Cat = memo(function Cat({ pose, facing }: { pose: CatPose; facing: Facing }) {
  return (
    <svg width={96} height={72} viewBox="-48 -64 96 72" className="overflow-visible" aria-hidden>
      <g style={{ transform: `scaleX(${facing})` }}>
        {pose === 'sleep' && <SleepingCat />}
        {(pose === 'sit' || pose === 'swipe') && <SittingCat swiping={pose === 'swipe'} />}
        {(pose === 'walk' || pose === 'run') && <WalkingCat running={pose === 'run'} />}
      </g>
    </svg>
  )
})

const pivot = (origin: string) => ({ transformBox: 'fill-box' as const, transformOrigin: origin })

function Eyes({ cx, cy, gap }: { cx: number; cy: number; gap: number }) {
  return (
    <g className="motion-safe:animate-cat-blink" style={pivot('center')}>
      <ellipse cx={cx - gap} cy={cy} rx={1.7} ry={2.4} fill={EYE} />
      <ellipse cx={cx + gap} cy={cy} rx={1.7} ry={2.4} fill={EYE} />
      <circle cx={cx - gap + 0.6} cy={cy - 0.9} r={0.6} fill="#FFFFFF" />
      <circle cx={cx + gap + 0.6} cy={cy - 0.9} r={0.6} fill="#FFFFFF" />
    </g>
  )
}

function SittingCat({ swiping }: { swiping: boolean }) {
  return (
    <g>
      <path d="M-12,-4 C-28,-4 -32,-22 -23,-32" fill="none" stroke={FUR} strokeWidth={5} strokeLinecap="round" className="motion-safe:animate-cat-tail" style={pivot('bottom right')} />
      <path d="M-15,0 C-17,-15 -11,-31 2,-31 C13,-31 17,-15 15,0 Z" fill={FUR} />
      <path d="M-11,-18 q4,-2 7,1 M-13,-11 q4,-2 7,1" fill="none" stroke={STRIPE} strokeWidth={1.6} strokeLinecap="round" />
      <ellipse cx={6} cy={-14} rx={6} ry={9.5} fill={CREAM} />
      {/* Передние лапы; правая при «скидывании» делает замах */}
      <rect x={0} y={-12} width={5} height={12} rx={2.5} fill={FUR} />
      <g className={swiping ? 'motion-safe:animate-cat-swipe' : ''} style={pivot('top')}>
        <rect x={7} y={-12} width={5} height={12} rx={2.5} fill={FUR} />
        <ellipse cx={9.5} cy={-1} rx={3.2} ry={2} fill={CREAM} />
      </g>
      <ellipse cx={2.5} cy={-1} rx={3.2} ry={2} fill={CREAM} />
      {/* Голова */}
      <g transform="translate(6 -37)">
        <path d="M-10,-4 L-9,-17 L-1,-9 Z M10,-4 L9,-17 L1,-9 Z" fill={FUR} />
        <path d="M-8,-6 L-7.5,-13.5 L-3,-9 Z M8,-6 L7.5,-13.5 L3,-9 Z" fill={EAR} />
        <circle r={11} fill={FUR} />
        <path d="M-3,-10 v3 M0,-11 v4 M3,-10 v3" stroke={STRIPE} strokeWidth={1.4} strokeLinecap="round" />
        <ellipse cy={4.5} rx={5.5} ry={3.8} fill={CREAM} />
        <Eyes cx={0} cy={-1} gap={4.2} />
        <path d="M-1.4,2.4 L1.4,2.4 L0,3.8 Z" fill="#E07A7A" />
        <path d="M5,4 l8,-1 M5,5.5 l8,1 M-5,4 l-8,-1 M-5,5.5 l-8,1" stroke="#F2F4F7" strokeOpacity={0.5} strokeWidth={0.6} />
      </g>
    </g>
  )
}

function SleepingCat() {
  return (
    <g>
      {/* Дыхание: всё тело чуть поднимается от «пола» */}
      <g className="motion-safe:animate-cat-breathe" style={pivot('bottom')}>
        <ellipse cx={-2} cy={-10} rx={26} ry={11} fill={FUR} />
        <path d="M-16,-18 q3,4 0,8 M-8,-20 q3,4 0,9 M0,-20 q3,4 0,9" fill="none" stroke={STRIPE} strokeWidth={1.6} strokeLinecap="round" />
        <g transform="translate(16 -11)">
          <path d="M-8,-4 L-9,-15 L-1,-8 Z M7,-5 L10,-15 L2,-9 Z" fill={FUR} />
          <circle r={10} fill={FUR} />
          <ellipse cx={1} cy={4} rx={5} ry={3.4} fill={CREAM} />
          <path d="M-6,-1 q2.5,2 5,0 M2,-1 q2.5,2 5,0" fill="none" stroke={EYE} strokeWidth={1.3} strokeLinecap="round" />
        </g>
        {/* Хвост укрывает лапы */}
        <path d="M-27,-6 C-30,5 6,7 22,0" fill="none" stroke={FUR} strokeWidth={5} strokeLinecap="round" />
        <path d="M14,1 C18,1 21,0 22,0" fill="none" stroke={STRIPE} strokeWidth={5} strokeLinecap="round" />
      </g>
      {['z', 'z', 'Z'].map((letter, i) => (
        <text key={i} x={26} y={-26} className="fill-fg-secondary text-[9px] font-semibold motion-safe:animate-cat-zzz" style={{ animationDelay: `${i * 1.1}s`, opacity: 0 }}>
          {letter}
        </text>
      ))}
    </g>
  )
}

function WalkingCat({ running }: { running: boolean }) {
  const legPeriod = running ? '0.28s' : '0.6s'
  const leg = (x: number, phase: number) => (
    <line
      key={x}
      x1={x}
      y1={-14}
      x2={x}
      y2={0}
      stroke={FUR}
      strokeWidth={4.5}
      strokeLinecap="round"
      className="motion-safe:animate-cat-leg"
      style={{ ...pivot('top'), animationDuration: legPeriod, animationDelay: `calc(${legPeriod} * ${-phase})` }}
    />
  )
  return (
    <g className="motion-safe:animate-cat-bob" style={{ animationDuration: running ? '0.28s' : '0.6s' }}>
      {running && <path d="M-46,-26 h12 M-50,-18 h14 M-44,-10 h10" stroke="#F2F4F7" strokeOpacity={0.25} strokeWidth={1.5} strokeLinecap="round" />}
      {running ? (
        <path d="M-20,-21 C-30,-21 -38,-23 -44,-26" fill="none" stroke={FUR} strokeWidth={5} strokeLinecap="round" />
      ) : (
        <path d="M-20,-21 C-32,-23 -36,-37 -30,-45" fill="none" stroke={FUR} strokeWidth={5} strokeLinecap="round" className="motion-safe:animate-cat-tail" style={pivot('bottom right')} />
      )}
      {/* Задние и передние лапы — в противофазе */}
      {leg(-14, 0)}
      {leg(12, 0)}
      {leg(-8, 0.5)}
      {leg(17, 0.5)}
      <ellipse cx={-1} cy={-20} rx={21} ry={9.5} fill={FUR} />
      <ellipse cx={0} cy={-14.5} rx={14} ry={4} fill={CREAM} />
      <path d="M-12,-28 q3,4 0,8 M-4,-29 q3,4 0,8 M4,-29 q3,4 0,8" fill="none" stroke={STRIPE} strokeWidth={1.6} strokeLinecap="round" />
      <g transform="translate(21 -28)">
        <path d="M-7,-5 L-6,-16 L0,-8 Z M2,-8 L7,-16 L8,-3 Z" fill={FUR} />
        <path d="M-5.5,-7 L-5,-12.5 L-2,-8.5 Z" fill={EAR} />
        <circle r={9.5} fill={FUR} />
        <ellipse cx={6} cy={3.5} rx={4.5} ry={3.2} fill={CREAM} />
        <ellipse cx={3.5} cy={-1.5} rx={1.6} ry={2.3} fill={EYE} />
        <path d="M8.6,1.6 L10.4,2.4 L8.8,3.4 Z" fill="#E07A7A" />
      </g>
    </g>
  )
}
