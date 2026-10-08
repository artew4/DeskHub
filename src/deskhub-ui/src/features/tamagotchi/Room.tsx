import { memo } from 'react'
import { ROOM } from './catStates'

// Палитра комнаты — приглушённые тона в гамме дашборда (фон карточки — surface-1 #14171C)
const C = {
  wall: '#171B21',
  wallLow: '#15191E',
  floor: '#101318',
  floorLine: '#14181D',
  baseboard: '#1F242C',
  frame: '#2A303A',
  curtain: '#2A2433',
  wood: '#4A3B30',
  woodDark: '#3A2E26',
  rug: '#2A2233',
  rugLine: '#3A2F45',
  bed: '#2E3A50',
  bedInner: '#3A4A66',
  leaf: '#3F6B4E',
  leafDark: '#2F5340',
  pot: '#5A4A40',
  warm: '#F5C451',
  moon: '#F4E9C8',
}

const SKY = { day: '#2B4F73', night: '#0D1B2E' }
const SKYLINE = { day: '#22405F', night: '#0A1220' }

/**
 * Комната кота — статичный плоский SVG 574×278 (1:1 с ячейкой 7×3).
 * Якоря (ANCHORS в catStates.ts): подоконник (136, 142), полка (396…536, y 118), лежанка на коврике (300, 252).
 * Меняется только при смене дня и ночи.
 */
export const Room = memo(function Room({ isNight }: { isNight: boolean }) {
  const sky = isNight ? SKY.night : SKY.day
  return (
    <svg viewBox={`0 0 ${ROOM.width} ${ROOM.height}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-hidden>
      {/* Стена и пол */}
      <rect width={ROOM.width} height={ROOM.height} fill={C.wall} />
      <rect y={150} width={ROOM.width} height={64} fill={C.wallLow} />
      <rect y={214} width={ROOM.width} height={64} fill={C.floor} />
      <rect y={209} width={ROOM.width} height={6} fill={C.baseboard} />
      <line x1={0} y1={236} x2={ROOM.width} y2={236} stroke={C.floorLine} strokeWidth={2} />
      <line x1={0} y1={260} x2={ROOM.width} y2={260} stroke={C.floorLine} strokeWidth={2} />

      {/* Свет: днём — пятно от окна на полу, ночью — конус от лампы */}
      {isNight ? (
        <polygon points="282,36 318,36 384,214 216,214" fill={C.warm} opacity={0.05} />
      ) : (
        <polygon points="66,214 204,214 250,262 40,262" fill="#FFFFFF" opacity={0.035} />
      )}

      <Window sky={sky} isNight={isNight} />

      {/* Картина */}
      <rect x={330} y={40} width={52} height={38} rx={2} fill={C.frame} />
      <rect x={334} y={44} width={44} height={30} fill="#1E2A36" />
      <polygon points="334,74 350,56 362,66 368,60 378,74" fill={C.leafDark} />
      <circle cx={368} cy={52} r={3} fill={isNight ? C.moon : C.warm} opacity={0.8} />

      {/* Подвесная лампа */}
      <line x1={300} y1={0} x2={300} y2={22} stroke={C.frame} strokeWidth={2} />
      <path d="M286,22 L314,22 L322,36 L278,36 Z" fill={C.frame} />
      <ellipse cx={300} cy={37} rx={6} ry={2.5} fill={isNight ? C.warm : '#3A414D'} />

      <Shelf />

      {/* Коврик и лежанка */}
      <ellipse cx={300} cy={256} rx={96} ry={17} fill={C.rug} />
      <ellipse cx={300} cy={256} rx={80} ry={12} fill="none" stroke={C.rugLine} strokeWidth={2} strokeDasharray="6 5" />
      <ellipse cx={300} cy={251} rx={48} ry={13} fill={C.bed} />
      <ellipse cx={300} cy={250} rx={37} ry={8} fill={C.bedInner} />

      <FloorPlant />
    </svg>
  )
})

function Window({ sky, isNight }: { sky: string; isNight: boolean }) {
  return (
    <g>
      {/* Шторы */}
      <path d="M40,24 L62,24 L60,146 Q50,150 40,146 Z" fill={C.curtain} />
      <path d="M208,24 L230,24 L230,146 Q220,150 210,146 Z" fill={C.curtain} />
      <rect x={36} y={20} width={198} height={5} rx={2} fill={C.frame} />

      <rect x={60} y={30} width={150} height={112} rx={4} fill={C.frame} />
      <rect x={66} y={36} width={138} height={100} fill={sky} />

      {isNight ? (
        <g>
          {/* Луна-полумесяц и мерцающие звёзды */}
          <circle cx={174} cy={60} r={11} fill={C.moon} />
          <circle cx={180} cy={56} r={10} fill={sky} />
          {[
            [86, 50, 0], [120, 44, 1.2], [148, 70, 0.6], [96, 78, 2], [192, 88, 1.6],
          ].map(([x, y, delay]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={1.2} fill="#FFFFFF" className="motion-safe:animate-twinkle" style={{ animationDelay: `${delay}s` }} />
          ))}
        </g>
      ) : (
        <g>
          <circle cx={96} cy={62} r={12} fill={C.warm} />
          <ellipse cx={156} cy={58} rx={18} ry={6} fill="#FFFFFF" opacity={0.18} />
          <ellipse cx={170} cy={54} rx={10} ry={5} fill="#FFFFFF" opacity={0.18} />
        </g>
      )}

      {/* Силуэт города; ночью — светящиеся окна */}
      <path d="M66,136 L66,112 L80,112 L80,100 L96,100 L96,118 L108,118 L108,94 L124,94 L124,110 L140,110 L140,102 L158,102 L158,120 L172,120 L172,96 L188,96 L188,114 L204,114 L204,136 Z" fill={isNight ? SKYLINE.night : SKYLINE.day} />
      {isNight &&
        [
          [84, 106], [112, 100], [116, 108], [146, 108], [176, 102], [180, 110], [194, 120],
        ].map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width={2.5} height={3} fill={C.warm} opacity={0.75} />)}

      {/* Переплёт и подоконник */}
      <line x1={135} y1={36} x2={135} y2={136} stroke={C.frame} strokeWidth={4} />
      <line x1={66} y1={86} x2={204} y2={86} stroke={C.frame} strokeWidth={4} />
      <rect x={52} y={140} width={166} height={8} rx={2} fill="#2F3540" />
    </g>
  )
}

/** Полка: горшок с растением, книги; место для кота и кружки (кружка — отдельный анимируемый слой). */
function Shelf() {
  return (
    <g>
      <rect x={396} y={118} width={140} height={7} rx={2} fill={C.wood} />
      <path d="M410,125 L410,137 L422,125 Z" fill={C.woodDark} />
      <path d="M522,125 L522,137 L510,125 Z" fill={C.woodDark} />
      {/* Растение */}
      <rect x={402} y={104} width={18} height={14} rx={2} fill={C.pot} />
      <ellipse cx={405} cy={96} rx={4} ry={10} fill={C.leaf} transform="rotate(-25 405 96)" />
      <ellipse cx={411} cy={92} rx={4} ry={12} fill={C.leafDark} />
      <ellipse cx={417} cy={96} rx={4} ry={10} fill={C.leaf} transform="rotate(25 417 96)" />
      {/* Книги */}
      <rect x={512} y={96} width={7} height={22} rx={1} fill="#3B4A6B" />
      <rect x={520} y={100} width={6} height={18} rx={1} fill="#6B3B3B" />
      <rect x={527} y={94} width={7} height={24} rx={1} fill="#3B6B5A" />
    </g>
  )
}

function FloorPlant() {
  return (
    <g>
      <ellipse cx={550} cy={196} rx={9} ry={34} fill={C.leafDark} transform="rotate(-18 550 196)" />
      <ellipse cx={556} cy={190} rx={8} ry={40} fill={C.leaf} transform="rotate(8 556 190)" />
      <ellipse cx={540} cy={206} rx={7} ry={26} fill={C.leaf} transform="rotate(-40 540 206)" />
      <path d="M534,226 L566,226 L562,262 L538,262 Z" fill={C.pot} />
    </g>
  )
}
