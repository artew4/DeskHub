import { memo, useId } from 'react'
import type { RoomLayout } from './catStates'
import { LAMP_X, SKYLINE_COLOR, SKY_GRADIENT, WINDOW, isOvercast, lampOn, type RoomPhase, type SkyCondition } from './roomEnvironment'

/**
 * Палитра комнаты — светлая пастель: днём комната гармонирует со светлыми темами дашборда,
 * вечером и ночью уходит в полумрак за счёт слоя освещения (RoomLighting), а не тёмных базовых цветов.
 * Пол — светлый холодный серо-голубой: на нём хорошо читается рыжий кот.
 */
const C = {
  wall: '#ECE5DC',
  wallTop: '#E3DBD0',
  wainscot: '#E0D6CA',
  floor: '#CDD3DA',
  floorLine: '#BEC5CE',
  baseboard: '#F7F3EE',
  frame: '#FAF7F2',
  frameEdge: '#D6CDC1',
  curtain: '#A9C2BA',
  curtainFold: '#93ADA5',
  rod: '#B79A7C',
  cord: '#8A8F96',
  lampShade: '#5E6773',
  wood: '#C49A72',
  woodDark: '#A57D58',
  rug: '#E3C7B8',
  rugLine: '#CFA996',
  bed: '#9DB3C8',
  bedInner: '#BACBDC',
  leaf: '#6E9C7A',
  leafDark: '#507F5F',
  pot: '#C98E6E',
  warm: '#F5C451',
  moon: '#F4E9C8',
}

/** Плавная смена освещения при смене фазы суток: opacity за 3 с (элемент всегда смонтирован). */
const TRANSITION = '3s ease-in-out'
const fade = (opacity: number) => ({ opacity, transition: `opacity ${TRANSITION}` })

const G = WINDOW.glass

interface RoomProps {
  phase: RoomPhase
  sky: SkyCondition
  layout: RoomLayout
}

/**
 * Комната кота — плоский SVG в реальном размере карточки (1:1, без масштабирования: кот и якоря в тех же пикселях).
 * Объекты нарисованы в базовом макете 574×278 и разнесены группами по layout (roomLayout в catStates.ts):
 * окно — у левого края, лампа/картина/коврик — по центру, полка/растение — у правого края, всё — от уровня пола.
 */
export const Room = memo(function Room({ phase, sky, layout }: RoomProps) {
  const isNight = lampOn(phase) // лампа, огни города и гирлянда — вечером и ночью
  const sunny = !isNight && !isOvercast(sky)
  const { width: w, height: h, floorTop, centerShift, rightShift, verticalShift } = layout
  const lampX = LAMP_X + centerShift
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="absolute inset-0" aria-hidden>
      {/* Стена, карниз, панели, плинтус и пол — во всю ширину */}
      <rect width={w} height={h} fill={C.wall} />
      <rect width={w} height={8} fill={C.wallTop} />
      <rect y={floorTop - 64} width={w} height={64} fill={C.wainscot} />
      <rect y={floorTop - 66} width={w} height={2} fill={C.baseboard} />
      <rect y={floorTop} width={w} height={h - floorTop} fill={C.floor} />
      <rect y={floorTop - 6} width={w} height={7} fill={C.baseboard} />
      <line x1={0} y1={floorTop + 22} x2={w} y2={floorTop + 22} stroke={C.floorLine} strokeWidth={1.5} />
      <line x1={0} y1={floorTop + 46} x2={w} y2={floorTop + 46} stroke={C.floorLine} strokeWidth={1.5} />

      {/* Гирлянда — только в высокой комнате (≥ 24 px над базовым макетом), иначе наползает на лампу */}
      {verticalShift >= 24 && <StringLights width={w} sag={Math.min(26, 10 + verticalShift / 4)} isNight={isNight} />}

      {/* Шнур лампы — от потолка, какой бы высоты ни была комната */}
      <line x1={lampX} y1={0} x2={lampX} y2={22 + verticalShift} stroke={C.cord} strokeWidth={1.5} />

      {/* Левая группа: большое окно и пятно солнечного света от него на полу */}
      <g transform={`translate(0 ${verticalShift})`}>
        <polygon points={`${G.x},214 ${G.x + G.width},214 ${G.x + G.width + 70},262 0,262`} fill="#FFFFFF" style={fade(sunny ? 0.35 : !isNight ? 0.12 : 0)} />
        <Window phase={phase} sky={sky} />
      </g>

      {/* Центральная группа: лампа, конус света, картина, коврик с лежанкой */}
      <g transform={`translate(${centerShift} ${verticalShift})`}>
        <polygon points={`${LAMP_X - 18},36 ${LAMP_X + 18},36 ${LAMP_X + 84},214 ${LAMP_X - 84},214`} fill={C.warm} style={fade(isNight ? 0.07 : 0)} />
        <CenterGroup isNight={isNight} />
      </g>

      {/* Правая группа: полка, напольное растение, миска */}
      <g transform={`translate(${rightShift} ${verticalShift})`}>
        <Shelf />
        <FloorPlant />
        <FoodBowl />
      </g>
    </svg>
  )
})

const BULB_COLORS = ['#F5C451', '#7FD1B9', '#F2A7A0', '#9DB8F2']

/**
 * Гирлянда под потолком — заполняет верх высокой комнаты. Провод провисает дугами между креплениями;
 * ночью лампочки светятся и мерцают (opacity), днём — приглушены.
 */
function StringLights({ width, sag, isNight }: { width: number; sag: number; isNight: boolean }) {
  const spans = Math.max(3, Math.round(width / 180))
  const spanWidth = width / spans
  const top = 12
  const bulbs: { x: number; y: number; color: string }[] = []
  let wire = `M0,${top}`
  for (let i = 0; i < spans; i++) {
    const x0 = i * spanWidth
    wire += ` Q${x0 + spanWidth / 2},${top + sag * 2} ${x0 + spanWidth},${top}`
    // Лампочки — по квадратичной кривой провода
    for (const t of [0.2, 0.4, 0.6, 0.8]) {
      const y = (1 - t) * (1 - t) * top + 2 * (1 - t) * t * (top + sag * 2) + t * t * top
      bulbs.push({ x: x0 + t * spanWidth, y, color: BULB_COLORS[bulbs.length % BULB_COLORS.length] })
    }
  }
  return (
    <g>
      <path d={wire} fill="none" stroke={C.cord} strokeWidth={1.5} />
      {bulbs.map((b, i) => (
        <g key={i}>
          {isNight && <circle cx={b.x} cy={b.y + 5} r={7} fill={b.color} opacity={0.12} />}
          <ellipse
            cx={b.x}
            cy={b.y + 5}
            rx={2.6}
            ry={3.6}
            fill={b.color}
            opacity={isNight ? 0.95 : 0.5}
            className={isNight ? 'motion-safe:animate-twinkle' : ''}
            style={isNight ? { animationDelay: `${(i % 5) * 0.6}s`, animationDuration: '4s' } : undefined}
          />
        </g>
      ))}
    </g>
  )
}

function CenterGroup({ isNight }: { isNight: boolean }) {
  const x = LAMP_X
  return (
    <g>
      {/* Картина — справа от лампы, над полкой */}
      <rect x={384} y={30} width={54} height={40} rx={2} fill={C.frame} stroke={C.frameEdge} strokeWidth={1} />
      <rect x={389} y={35} width={44} height={30} fill="#CFE2EA" />
      <polygon points="389,65 405,47 417,57 423,51 433,65" fill={C.leaf} />
      <circle cx={423} cy={43} r={3} fill={isNight ? C.moon : C.warm} opacity={0.9} />

      {/* Подвесная лампа (шнур — в Room) */}
      <path d={`M${x - 14},22 L${x + 14},22 L${x + 22},36 L${x - 22},36 Z`} fill={C.lampShade} />
      <ellipse cx={x} cy={37} rx={6} ry={2.5} style={{ fill: isNight ? C.warm : '#C9CED4', transition: `fill ${TRANSITION}` }} />

      {/* Коврик и лежанка */}
      <ellipse cx={x} cy={256} rx={96} ry={17} fill={C.rug} />
      <ellipse cx={x} cy={256} rx={80} ry={12} fill="none" stroke={C.rugLine} strokeWidth={2} strokeDasharray="6 5" />
      <ellipse cx={x} cy={251} rx={48} ry={13} fill={C.bed} />
      <ellipse cx={x} cy={250} rx={37} ry={8} fill={C.bedInner} />
    </g>
  )
}

/** Большое окно: шторы, белая рама, небо (градиент по фазе и погоде), светила, силуэт города. Погода — HTML-слой WindowWeather поверх, переплёт — RoomFront. */
function Window({ phase, sky }: { phase: RoomPhase; sky: SkyCondition }) {
  const overcast = isOvercast(sky)
  const [top, bottom] = overcast ? SKY_GRADIENT[phase].overcast : SKY_GRADIENT[phase].clear
  // id постоянный: при смене фазы/погоды меняются только stop-color — и плавно перетекают (transition 3 с)
  const gradientId = `sky-${useId().replace(/:/g, '')}`
  const lit = lampOn(phase)
  const F = WINDOW.frame
  return (
    <g>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: top, transition: `stop-color ${TRANSITION}` }} />
          <stop offset="1" style={{ stopColor: bottom, transition: `stop-color ${TRANSITION}` }} />
        </linearGradient>
      </defs>
      {/* Карниз и шторы по бокам рамы */}
      <rect x={F.x - 26} y={F.y - 7} width={F.width + 52} height={4} rx={2} fill={C.rod} />
      <path d={`M${F.x - 24},${F.y - 4} L${F.x + 2},${F.y - 4} L${F.x},${F.y + F.height + 2} Q${F.x - 12},${F.y + F.height + 8} ${F.x - 24},${F.y + F.height + 2} Z`} fill={C.curtain} />
      <path d={`M${F.x - 14},${F.y} L${F.x - 12},${F.y + F.height}`} stroke={C.curtainFold} strokeWidth={2} />
      <path d={`M${F.x + F.width - 2},${F.y - 4} L${F.x + F.width + 24},${F.y - 4} L${F.x + F.width + 24},${F.y + F.height + 2} Q${F.x + F.width + 12},${F.y + F.height + 8} ${F.x + F.width},${F.y + F.height + 2} Z`} fill={C.curtain} />
      <path d={`M${F.x + F.width + 12},${F.y} L${F.x + F.width + 14},${F.y + F.height}`} stroke={C.curtainFold} strokeWidth={2} />

      <rect x={F.x} y={F.y} width={F.width} height={F.height} rx={4} fill={C.frame} stroke={C.frameEdge} strokeWidth={1} />
      <rect x={G.x} y={G.y} width={G.width} height={G.height} fill={`url(#${gradientId})`} />

      {/* Светила всех фаз смонтированы, видна только текущая (и только когда небо не затянуто) */}
      {(['morning', 'day', 'evening', 'night'] as const).map((p) => (
        <Celestial key={p} phase={p} visible={!overcast && p === phase} />
      ))}

      {/* Силуэт города; вечером и ночью — светящиеся окна */}
      <path
        d="M42,178 L42,142 L60,142 L60,128 L82,128 L82,150 L98,150 L98,120 L120,120 L120,140 L142,140 L142,130 L166,130 L166,152 L184,152 L184,124 L206,124 L206,146 L228,146 L228,134 L246,134 L246,148 L262,148 L262,178 Z"
        style={{ fill: SKYLINE_COLOR[phase], transition: `fill ${TRANSITION}` }}
      />
      <g style={fade(lit ? 0.8 : 0)}>
        {[
          [66, 134], [104, 126], [110, 136], [150, 138], [190, 130], [196, 140], [212, 152], [234, 140], [252, 154], [72, 150],
        ].map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width={3} height={3.5} fill={C.warm} />)}
      </g>
    </g>
  )
}

/** Солнце по фазе (утром низко слева, днём высоко, вечером садится за город), ночью — полумесяц и звёзды. */
function Celestial({ phase, visible }: { phase: RoomPhase; visible: boolean }) {
  if (phase === 'night') {
    return (
      <g style={fade(visible ? 1 : 0)}>
        <circle cx={222} cy={58} r={13} fill={C.moon} />
        <circle cx={229} cy={53} r={12} fill={SKY_GRADIENT.night.clear[0]} />
        {[
          [64, 46, 0], [110, 36, 1.2], [150, 70, 0.6], [88, 92, 2], [244, 98, 1.6], [180, 40, 0.9], [128, 104, 2.4],
        ].map(([x, y, delay]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={1.3} fill="#FFFFFF" className={visible ? 'motion-safe:animate-twinkle' : ''} style={{ animationDelay: `${delay}s` }} />
        ))}
      </g>
    )
  }
  const sun = {
    morning: { cx: 78, cy: 136, r: 14, fill: '#FFD08A' },
    day: { cx: 88, cy: 60, r: 15, fill: C.warm },
    evening: { cx: 226, cy: 146, r: 18, fill: '#FF9A5A' },
  }[phase]
  return (
    <g style={fade(visible ? 1 : 0)}>
      <circle cx={sun.cx} cy={sun.cy} r={sun.r + 8} fill={sun.fill} opacity={0.2} />
      <circle {...sun} />
    </g>
  )
}

/**
 * Передний план окна — поверх слоя погоды (облака и осадки идут «за стеклом»): белый переплёт и широкий подоконник.
 * Статичный SVG того же размера, что и комната.
 */
export const RoomFront = memo(function RoomFront({ layout }: { layout: RoomLayout }) {
  const S = WINDOW.sill
  return (
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width} height={layout.height} className="pointer-events-none absolute inset-0" aria-hidden>
      <g transform={`translate(0 ${layout.verticalShift})`}>
        <line x1={WINDOW.mullionX} y1={G.y} x2={WINDOW.mullionX} y2={G.y + G.height} stroke={C.frame} strokeWidth={5} />
        <line x1={G.x} y1={WINDOW.mullionY} x2={G.x + G.width} y2={WINDOW.mullionY} stroke={C.frame} strokeWidth={5} />
        <rect x={S.x} y={S.y} width={S.width} height={S.height} rx={2} fill={C.baseboard} stroke={C.frameEdge} strokeWidth={1} />
        <rect x={S.x + 4} y={S.y + S.height} width={S.width - 8} height={3} fill="#000000" opacity={0.08} />
      </g>
    </svg>
  )
})

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
      <rect x={512} y={96} width={7} height={22} rx={1} fill="#7C93B8" />
      <rect x={520} y={100} width={6} height={18} rx={1} fill="#C98A8A" />
      <rect x={527} y={94} width={7} height={24} rx={1} fill="#7FB09A" />
    </g>
  )
}

/** Миска с кормом у растения. */
function FoodBowl() {
  return (
    <g>
      <ellipse cx={462} cy={263} rx={15} ry={3} fill="#000000" opacity={0.12} />
      <path d="M448,254 L476,254 L472,263 L452,263 Z" fill="#3A5A8C" />
      <ellipse cx={462} cy={254} rx={14} ry={3.2} fill="#4C72AE" />
      <ellipse cx={462} cy={254} rx={10.5} ry={2} fill="#8B5E3C" />
      <circle cx={458} cy={253.2} r={1.4} fill="#A87449" />
      <circle cx={463} cy={252.8} r={1.4} fill="#A87449" />
      <circle cx={467} cy={253.4} r={1.3} fill="#A87449" />
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
