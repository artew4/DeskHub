import { memo } from 'react'
import type { CatPose, Facing } from './catStates'

// Рыжий кот — самый заметный объект в тёмной комнате
const FUR = '#E39A5B'
const STRIPE = '#B8703A'
const CREAM = '#F3E3CF'
const EAR = '#F2A7A0'
const EYE = '#1B1F24'
const NOSE = '#E07A7A'

/**
 * Векторный кот. Начало координат — точка между лапами (x = 0, y = 0), кот смотрит вправо;
 * разворот — scaleX(facing). Все анимации — CSS keyframes на transform/opacity (tailwind.config.js);
 * transform-box: fill-box задаёт точку вращения относительно самого элемента.
 */
export const Cat = memo(function Cat({ pose, facing }: { pose: CatPose; facing: Facing }) {
  return (
    <svg width={96} height={72} viewBox="-48 -64 96 72" className="overflow-visible" aria-hidden>
      <g style={{ transform: `scaleX(${facing})` }}>
        {pose === 'sleep' && <SleepingCat />}
        {(pose === 'sit' || pose === 'swipe' || pose === 'groom') && <SittingCat mode={pose} />}
        {(pose === 'walk' || pose === 'run') && <WalkingCat running={pose === 'run'} />}
        {pose === 'stretch' && <StretchingCat />}
        {pose === 'play' && <PlayingCat />}
      </g>
    </svg>
  )
})

const pivot = (origin: string) => ({ transformBox: 'fill-box' as const, transformOrigin: origin })

function Eyes({ cx, cy, gap, closed = false }: { cx: number; cy: number; gap: number; closed?: boolean }) {
  if (closed) {
    // Довольные прищуренные глаза
    return (
      <path
        d={`M${cx - gap - 2},${cy} q2,-2 4,0 M${cx + gap - 2},${cy} q2,-2 4,0`}
        fill="none"
        stroke={EYE}
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    )
  }
  return (
    <g className="motion-safe:animate-cat-blink" style={pivot('center')}>
      <ellipse cx={cx - gap} cy={cy} rx={1.7} ry={2.4} fill={EYE} />
      <ellipse cx={cx + gap} cy={cy} rx={1.7} ry={2.4} fill={EYE} />
      <circle cx={cx - gap + 0.6} cy={cy - 0.9} r={0.6} fill="#FFFFFF" />
      <circle cx={cx + gap + 0.6} cy={cy - 0.9} r={0.6} fill="#FFFFFF" />
    </g>
  )
}

/** Голова анфас (сидя): уши, полоски, мордочка, нос, усы. */
function FrontHead({ eyesClosed = false }: { eyesClosed?: boolean }) {
  return (
    <>
      <path d="M-10,-4 L-9,-17 L-1,-9 Z M10,-4 L9,-17 L1,-9 Z" fill={FUR} />
      <path d="M-8,-6 L-7.5,-13.5 L-3,-9 Z M8,-6 L7.5,-13.5 L3,-9 Z" fill={EAR} />
      <circle r={11} fill={FUR} />
      <path d="M-3,-10 v3 M0,-11 v4 M3,-10 v3" stroke={STRIPE} strokeWidth={1.4} strokeLinecap="round" />
      <ellipse cy={4.5} rx={5.5} ry={3.8} fill={CREAM} />
      <Eyes cx={0} cy={-1} gap={4.2} closed={eyesClosed} />
      <path d="M-1.4,2.4 L1.4,2.4 L0,3.8 Z" fill={NOSE} />
      <path d="M5,4 l8,-1 M5,5.5 l8,1 M-5,4 l-8,-1 M-5,5.5 l-8,1" stroke="#F2F4F7" strokeOpacity={0.5} strokeWidth={0.6} />
    </>
  )
}

/** Сидит; swipe — замах лапой (кружка, клубок); groom — умывается: лапка у мордочки, голова покачивается. */
function SittingCat({ mode }: { mode: 'sit' | 'swipe' | 'groom' }) {
  const grooming = mode === 'groom'
  return (
    <g>
      <path
        d="M-12,-4 C-28,-4 -32,-22 -23,-32"
        fill="none"
        stroke={FUR}
        strokeWidth={5}
        strokeLinecap="round"
        className="motion-safe:animate-cat-tail"
        style={pivot('bottom right')}
      />
      <path d="M-15,0 C-17,-15 -11,-31 2,-31 C13,-31 17,-15 15,0 Z" fill={FUR} />
      <path d="M-11,-18 q4,-2 7,1 M-13,-11 q4,-2 7,1" fill="none" stroke={STRIPE} strokeWidth={1.6} strokeLinecap="round" />
      <ellipse cx={6} cy={-14} rx={6} ry={9.5} fill={CREAM} />
      <rect x={0} y={-12} width={5} height={12} rx={2.5} fill={FUR} />
      <ellipse cx={2.5} cy={-1} rx={3.2} ry={2} fill={CREAM} />
      {!grooming && (
        <g className={mode === 'swipe' ? 'motion-safe:animate-cat-swipe' : ''} style={pivot('top')}>
          <rect x={7} y={-12} width={5} height={12} rx={2.5} fill={FUR} />
          <ellipse cx={9.5} cy={-1} rx={3.2} ry={2} fill={CREAM} />
        </g>
      )}
      <g transform="translate(6 -37)">
        <g className={grooming ? 'motion-safe:animate-cat-head-tilt' : ''} style={pivot('bottom')}>
          <FrontHead eyesClosed={grooming} />
        </g>
      </g>
      {grooming && (
        // Лапка поднята к мордочке (поверх головы) и «вылизывается» короткими движениями
        <g className="motion-safe:animate-cat-groom" style={pivot('bottom')}>
          <rect x={9} y={-31} width={5.5} height={15} rx={2.75} fill={FUR} />
          <ellipse cx={11.75} cy={-31} rx={3.6} ry={2.8} fill={CREAM} />
        </g>
      )}
    </g>
  )
}

function SleepingCat() {
  return (
    <g>
      {/* Медленное дыхание: всё тело чуть поднимается от «пола» */}
      <g className="motion-safe:animate-cat-breathe" style={pivot('bottom')}>
        <ellipse cx={-2} cy={-10} rx={26} ry={11} fill={FUR} />
        <path d="M-16,-18 q3,4 0,8 M-8,-20 q3,4 0,9 M0,-20 q3,4 0,9" fill="none" stroke={STRIPE} strokeWidth={1.6} strokeLinecap="round" />
        <g transform="translate(16 -11)">
          <path d="M-8,-4 L-9,-15 L-1,-8 Z M7,-5 L10,-15 L2,-9 Z" fill={FUR} />
          <circle r={10} fill={FUR} />
          <ellipse cx={1} cy={4} rx={5} ry={3.4} fill={CREAM} />
          <path d="M-6,-1 q2.5,2 5,0 M2,-1 q2.5,2 5,0" fill="none" stroke={EYE} strokeWidth={1.3} strokeLinecap="round" />
        </g>
        {/* Хвост укрывает лапы; кончик иногда вздрагивает */}
        <path d="M-27,-6 C-30,5 6,7 22,0" fill="none" stroke={FUR} strokeWidth={5} strokeLinecap="round" />
        <path d="M14,1 C18,1 21,0 22,0" fill="none" stroke={STRIPE} strokeWidth={5} strokeLinecap="round" className="motion-safe:animate-cat-tail-twitch" style={pivot('left')} />
      </g>
      {['z', 'z', 'Z'].map((letter, i) => (
        <text
          key={i}
          x={26}
          y={-26}
          className="fill-fg-secondary text-[9px] font-semibold motion-safe:animate-cat-zzz"
          style={{ animationDelay: `${i * 1.4}s`, opacity: 0 }}
        >
          {letter}
        </text>
      ))}
    </g>
  )
}

/** Голова в профиль (идёт, бежит, играет). */
function SideHead({ wide = false }: { wide?: boolean }) {
  return (
    <>
      <path d="M-7,-5 L-6,-16 L0,-8 Z M2,-8 L7,-16 L8,-3 Z" fill={FUR} />
      <path d="M-5.5,-7 L-5,-12.5 L-2,-8.5 Z" fill={EAR} />
      <circle r={9.5} fill={FUR} />
      <ellipse cx={6} cy={3.5} rx={4.5} ry={3.2} fill={CREAM} />
      {/* В игре зрачки расширены */}
      <ellipse cx={3.5} cy={-1.5} rx={wide ? 2.2 : 1.6} ry={wide ? 2.8 : 2.3} fill={EYE} />
      {wide && <circle cx={4.2} cy={-2.5} r={0.7} fill="#FFFFFF" />}
      <path d="M8.6,1.6 L10.4,2.4 L8.8,3.4 Z" fill={NOSE} />
    </>
  )
}

function Leg({ x, period, phase, className = 'motion-safe:animate-cat-leg' }: { x: number; period: string; phase: number; className?: string }) {
  return (
    <line
      x1={x}
      y1={-14}
      x2={x}
      y2={0}
      stroke={FUR}
      strokeWidth={4.5}
      strokeLinecap="round"
      className={className}
      style={{ ...pivot('top'), animationDuration: period, animationDelay: `calc(${period} * ${-phase})` }}
    />
  )
}

/** Идёт (спокойно, хвост покачивается) или «тыгыдык»: хвост трубой, распушён, резкие подскоки. */
function WalkingCat({ running }: { running: boolean }) {
  const period = running ? '0.26s' : '0.6s'
  return (
    <g className={running ? 'motion-safe:animate-cat-hop' : 'motion-safe:animate-cat-bob'}>
      {running && (
        <path d="M-46,-26 h12 M-50,-18 h14 M-44,-10 h10" stroke="#F2F4F7" strokeOpacity={0.25} strokeWidth={1.5} strokeLinecap="round" />
      )}
      {running ? (
        // Хвост трубой — вертикально, толще (распушился)
        <path d="M-19,-24 C-22,-34 -20,-44 -22,-54" fill="none" stroke={FUR} strokeWidth={7} strokeLinecap="round" className="motion-safe:animate-cat-tail-quiver" style={pivot('bottom')} />
      ) : (
        <path d="M-20,-21 C-32,-23 -36,-37 -30,-45" fill="none" stroke={FUR} strokeWidth={5} strokeLinecap="round" className="motion-safe:animate-cat-tail" style={pivot('bottom right')} />
      )}
      {/* Задние и передние лапы — в противофазе */}
      <Leg x={-14} period={period} phase={0} />
      <Leg x={12} period={period} phase={0} />
      <Leg x={-8} period={period} phase={0.5} />
      <Leg x={17} period={period} phase={0.5} />
      <ellipse cx={-1} cy={-20} rx={21} ry={9.5} fill={FUR} />
      <ellipse cx={0} cy={-14.5} rx={14} ry={4} fill={CREAM} />
      <path d="M-12,-28 q3,4 0,8 M-4,-29 q3,4 0,8 M4,-29 q3,4 0,8" fill="none" stroke={STRIPE} strokeWidth={1.6} strokeLinecap="round" />
      <g transform="translate(21 -28)">
        <SideHead wide={running} />
      </g>
    </g>
  )
}

/** Потягушки: «поза приветствия солнцу» — передние лапы вытянуты, попа вверх, зевок; тело тянется (scaleX/Y). */
function StretchingCat() {
  return (
    <g className="motion-safe:animate-cat-stretch" style={pivot('bottom')}>
      <path d="M-18,-26 C-26,-36 -20,-48 -10,-50" fill="none" stroke={FUR} strokeWidth={5} strokeLinecap="round" />
      {/* Задние лапы — прямые, высокие */}
      <line x1={-15} y1={-20} x2={-15} y2={0} stroke={FUR} strokeWidth={5} strokeLinecap="round" />
      <line x1={-9} y1={-20} x2={-9} y2={0} stroke={FUR} strokeWidth={5} strokeLinecap="round" />
      {/* Корпус наклонён: зад высоко, грудь у пола */}
      <ellipse cx={0} cy={-17} rx={21} ry={8.5} fill={FUR} transform="rotate(16 0 -17)" />
      <path d="M-12,-24 q3,4 0,7 M-5,-22 q3,4 0,7" fill="none" stroke={STRIPE} strokeWidth={1.6} strokeLinecap="round" />
      {/* Передние лапы вытянуты вперёд по полу */}
      <line x1={12} y1={-5} x2={30} y2={-1.5} stroke={FUR} strokeWidth={4.5} strokeLinecap="round" />
      <line x1={10} y1={-3} x2={27} y2={0} stroke={FUR} strokeWidth={4.5} strokeLinecap="round" />
      <ellipse cx={30.5} cy={-1} rx={3} ry={2} fill={CREAM} />
      <g transform="translate(20 -12)">
        <path d="M-7,-5 L-7,-15 L0,-8 Z M2,-8 L8,-15 L8,-3 Z" fill={FUR} />
        <circle r={9} fill={FUR} />
        <ellipse cx={5} cy={3.5} rx={4.5} ry={3.2} fill={CREAM} />
        <path d="M0,-2 q2,-2 4,0" fill="none" stroke={EYE} strokeWidth={1.3} strokeLinecap="round" />
        {/* Зевок */}
        <ellipse cx={7} cy={5} rx={2} ry={2.6} fill="#5A2E2E" className="motion-safe:animate-cat-yawn" style={pivot('top')} />
      </g>
    </g>
  )
}

/** Играет с клубком: припал к полу, попа и хвост ходят, передние лапки быстро поочерёдно бьют вперёд. */
function PlayingCat() {
  return (
    <g>
      <g className="motion-safe:animate-cat-wiggle" style={pivot('bottom left')}>
        <path d="M-20,-14 C-30,-12 -36,-20 -38,-28" fill="none" stroke={FUR} strokeWidth={5} strokeLinecap="round" className="motion-safe:animate-cat-tail-quiver" style={pivot('left')} />
        <ellipse cx={-13} cy={-9} rx={8} ry={7} fill={FUR} />
      </g>
      <ellipse cx={-2} cy={-10} rx={19} ry={8.5} fill={FUR} />
      <ellipse cx={0} cy={-5.5} rx={12} ry={3.2} fill={CREAM} />
      <path d="M-10,-17 q3,4 0,7 M-3,-18 q3,4 0,7" fill="none" stroke={STRIPE} strokeWidth={1.6} strokeLinecap="round" />
      {/* Передние лапки — «перебирание» в противофазе */}
      {[0, 0.5].map((phase) => (
        <line
          key={phase}
          x1={12}
          y1={-7}
          x2={24}
          y2={-2}
          stroke={FUR}
          strokeWidth={4.5}
          strokeLinecap="round"
          className="motion-safe:animate-cat-bat"
          style={{ ...pivot('left'), animationDelay: `calc(0.36s * ${-phase})` }}
        />
      ))}
      <g transform="translate(17 -15)">
        <SideHead wide />
      </g>
    </g>
  )
}
