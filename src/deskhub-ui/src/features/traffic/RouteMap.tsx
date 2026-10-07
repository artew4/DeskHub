import type { RouteModel } from '../../types/dashboard'
import { congestionFill, congestionStroke, formatDuration } from './traffic.mappers'

/**
 * Схема поездки в стиле карты метро с сохранением географии Москвы (север — вверху).
 * Координаты в системе viewBox 540×216 — почти 1:1 с полезной областью карточки,
 * поэтому размеры шрифтов внутри SVG — реальные пиксели.
 *
 *        Работа ●━━━━━━━━━━━━━━━━━━━━━━━━━━━╮   МКАД: от Дома на восток, на север
 *  (Останкино)  ┃                             ┃   и по северу к Работе
 *               ┃ пр. Мира      [МКАД]        ┃
 *          ╭────●────╮                        ┃
 *    ТТК  │  центр    ╲ ← дуга ТТК            ┃
 *          ╰─────────╯╲     [ТТК]            ╱
 *                       ╲━━━━━━━━━━━━━━━━━● Дом (Вешняки, юго-восток)
 *                         ш. Энтузиастов
 */
export const VIEWBOX = { width: 540, height: 216 }

const HOME = { x: 440, y: 184 } // Вешняки — восток/юго-восток от центра
const WORK = { x: 150, y: 30 } // Ак. Королева — север, почти над центром
const CITY_CENTER = { x: 150, y: 148 }
const TTK_RADIUS = 54

interface RouteGeometry {
  /** Линия маршрута */
  path: string
  /** Базовая линия крупного времени; строка с названием — на 30 px выше */
  label: { x: number; y: number }
}

// Свободная область между линиями: x 240…~470, y 40…170 (проверено на пересечения с линиями)
const LABEL_X = 240

// Ключи — RouteModel.id с бэкенда
const GEOMETRY: Record<string, RouteGeometry> = {
  // ш. Энтузиастов на запад → 45° к ТТК → дуга ТТК против часовой (восток → север) → пр. Мира на север
  ttk: {
    path:
      `M${HOME.x},${HOME.y} L240,184 L${CITY_CENTER.x + TTK_RADIUS},${CITY_CENTER.y} ` +
      `A${TTK_RADIUS},${TTK_RADIUS} 0 0 0 ${CITY_CENTER.x},${CITY_CENTER.y - TTK_RADIUS} L${WORK.x},${WORK.y}`,
    label: { x: LABEL_X, y: 152 },
  },
  // Дугой на восток к МКАД → по МКАД на север → по северу на запад к Работе
  mkad: {
    path: `M${HOME.x},${HOME.y} C528,176 524,24 392,22 L172,22 Q${WORK.x},22 ${WORK.x},${WORK.y}`,
    label: { x: LABEL_X, y: 88 },
  },
}

// Неизвестный id (новый провайдер) — рисуем по порядку, чтобы не потерять данные
const FALLBACK_ORDER = [GEOMETRY.ttk, GEOMETRY.mkad]

const geometryOf = (route: RouteModel, index: number): RouteGeometry | undefined =>
  GEOMETRY[route.id] ?? FALLBACK_ORDER[index]

interface RouteMapProps {
  routes: RouteModel[]
  originName: string
  destinationName: string
  fastestId: string | null
  savesMinutes: number
}

export function RouteMap({ routes, originName, destinationName, fastestId, savesMinutes }: RouteMapProps) {
  // Быстрый маршрут рисуется последним — поверх общего участка у станций
  const ordered = routes
    .slice(0, FALLBACK_ORDER.length)
    .map((route, index) => ({ route, geometry: geometryOf(route, index) }))
    .filter((r): r is { route: RouteModel; geometry: RouteGeometry } => r.geometry !== undefined)
    .sort((a, b) => Number(a.route.id === fastestId) - Number(b.route.id === fastestId))

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
      className="size-full overflow-visible"
      role="img"
      aria-label={routes.map((r) => `${r.name}: ${formatDuration(r.durationMinutes)}`).join(', ')}
    >
      <CityContext />

      {ordered.map(({ route, geometry }) => (
        <path
          key={route.id}
          d={geometry.path}
          fill="none"
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-colors duration-500 ${congestionStroke[route.congestion]}`}
        />
      ))}

      {ordered.map(({ route, geometry }) => (
        <g key={route.id} data-route-label={route.id}>
          <text x={geometry.label.x} y={geometry.label.y - 30} className="text-[14px] tabular-nums">
            <tspan className="fill-fg-secondary">{route.name}</tspan>
            <tspan dx={6} className="fill-fg-muted">
              · {route.distanceKm.toFixed(1)} км
            </tspan>
          </text>
          <text x={geometry.label.x} y={geometry.label.y} className="tabular-nums">
            <tspan className={`text-[28px] font-semibold transition-colors duration-500 ${congestionFill[route.congestion]}`}>
              {formatDuration(route.durationMinutes)}
            </tspan>
            {/* «1 ч 12 мин» уже длинное — пометку не добавляем, чтобы строка не дошла до дуги МКАД */}
            {route.id === fastestId && route.durationMinutes < 60 && (
              <tspan dx={8} className="fill-fg-primary text-[13px] font-semibold">
                быстрее на {savesMinutes} мин
              </tspan>
            )}
          </text>
        </g>
      ))}

      {/* Подписи станций — с той стороны, куда не уходят линии */}
      <Station x={WORK.x} y={WORK.y} label={destinationName} labelX={WORK.x - 16} labelY={WORK.y + 5} anchor="end" />
      <Station x={HOME.x} y={HOME.y} label={originName} labelX={HOME.x} labelY={HOME.y + 26} anchor="middle" />
    </svg>
  )
}

/** Ориентир: бледное кольцо ТТК вокруг центра. */
function CityContext() {
  return (
    <g aria-hidden>
      <circle cx={CITY_CENTER.x} cy={CITY_CENTER.y} r={TTK_RADIUS} fill="none" strokeWidth={2} className="stroke-surface-2" />
      <text
        x={CITY_CENTER.x - TTK_RADIUS - 8}
        y={CITY_CENTER.y + 4}
        textAnchor="end"
        className="fill-fg-muted text-[11px] font-semibold uppercase tracking-wider"
      >
        ТТК
      </text>
    </g>
  )
}

interface StationProps {
  x: number
  y: number
  label: string
  labelX: number
  labelY: number
  anchor: 'start' | 'middle' | 'end'
}

/** Станция — как пересадочный узел на схеме метро: кольцо цвета текста на фоне карточки. */
function Station({ x, y, label, labelX, labelY, anchor }: StationProps) {
  return (
    <g>
      <circle cx={x} cy={y} r={8} strokeWidth={3.5} className="fill-surface-1 stroke-fg-primary" />
      <text x={labelX} y={labelY} textAnchor={anchor} className="fill-fg-primary text-[13px] font-semibold">
        {label}
      </text>
    </g>
  )
}

/** Контуры схемы для скелетона загрузки. */
export function RouteMapSkeleton() {
  return (
    <svg viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`} className="size-full" aria-hidden>
      <circle cx={CITY_CENTER.x} cy={CITY_CENTER.y} r={TTK_RADIUS} fill="none" strokeWidth={2} className="stroke-surface-2" />
      {FALLBACK_ORDER.map((g) => (
        <path key={g.path} d={g.path} fill="none" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" className="stroke-surface-2" />
      ))}
      <circle cx={HOME.x} cy={HOME.y} r={8} className="fill-surface-2" />
      <circle cx={WORK.x} cy={WORK.y} r={8} className="fill-surface-2" />
    </svg>
  )
}
