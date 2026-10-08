// «Кошачий мозг»: состояния, веса, якоря комнаты и планирование шагов. Чистые функции — без React и таймеров.

export type CatState = 'SLEEPING_RUG' | 'WINDOW_WATCHING' | 'SHELF_SITTING' | 'WALKING' | 'ZOOMIES' | 'KNOCKING_ITEM'

/** Поза определяет, какой рисунок кота показывать. */
export type CatPose = 'sit' | 'sleep' | 'walk' | 'run' | 'swipe'

export type Facing = 1 | -1

export interface Point {
  x: number
  y: number
}

/** Кадр, который видит пользователь: состояние, поза, точка «лап» кота в координатах комнаты 574×278. */
export interface CatFrame extends Point {
  state: CatState
  pose: CatPose
  facing: Facing
  /** Длительность CSS-перехода к (x, y) */
  moveMs: number
}

export interface CatStep {
  frame: CatFrame
  durationMs: number
  /** Побочное действие в начале шага */
  effect?: 'knockMug' | 'restoreMug'
}

/** Базовый макет комнаты, под который нарисованы объекты; реальная комната растягивается вокруг него. */
export const BASE_ROOM = { width: 574, height: 278, floorTop: 214 }

/**
 * Геометрия комнаты под фактический размер карточки (1:1 в пикселях — кот всегда одного размера).
 * Пол прижат к низу, окно — к левому краю, лампа и коврик — по центру, полка и растение — к правому краю.
 * Чем шире и выше карточка, тем больше пола для прогулок.
 */
export interface RoomLayout {
  width: number
  height: number
  floorTop: number
  /** Сдвиг центральной группы (лампа, картина, коврик) относительно базового макета */
  centerShift: number
  /** Сдвиг правой группы (полка, растение) */
  rightShift: number
  /** Сдвиг всего «интерьера» по вертикали (пол опустился вместе с низом карточки) */
  verticalShift: number
  anchors: {
    rug: Point
    windowSill: Point
    shelf: Point
    shelfNearMug: Point
    mugOnShelf: Point
    mugOnFloor: Point
  }
  floor: { minX: number; maxX: number; minY: number; maxY: number }
}

export function roomLayout(width: number, height: number): RoomLayout {
  // Комната может быть и чуть меньше базового макета (ячейка 572×276 на 1024×600) — объекты сдвигаются на пару пикселей
  const w = Math.max(width, 480)
  const h = Math.max(height, 240)
  const floorTop = h - (BASE_ROOM.height - BASE_ROOM.floorTop)
  const verticalShift = floorTop - BASE_ROOM.floorTop
  const centerShift = Math.round(w / 2 - BASE_ROOM.width / 2)
  const rightShift = w - BASE_ROOM.width
  const shelfY = 118 + verticalShift
  return {
    width: w,
    height: h,
    floorTop,
    centerShift,
    rightShift,
    verticalShift,
    anchors: {
      rug: { x: 300 + centerShift, y: floorTop + 38 },
      windowSill: { x: 136, y: 142 + verticalShift },
      shelf: { x: 448 + rightShift, y: shelfY },
      shelfNearMug: { x: 470 + rightShift, y: shelfY },
      mugOnShelf: { x: 498 + rightShift, y: shelfY },
      mugOnFloor: { x: 484 + rightShift, y: h - 14 },
    },
    floor: { minX: 70, maxX: w - 54, minY: floorTop + 36, maxY: floorTop + 48 },
  }
}

export const STATE_LABELS: Record<CatState, string> = {
  SLEEPING_RUG: 'спит на коврике',
  WINDOW_WATCHING: 'смотрит в окно',
  SHELF_SITTING: 'сидит на полке',
  WALKING: 'гуляет по комнате',
  ZOOMIES: 'носится как угорелый',
  KNOCKING_ITEM: 'скидывает кружку',
}

/** Базовые веса: сон — чаще всего, «тыгыдык» — редко. */
const BASE_WEIGHTS: Record<CatState, number> = {
  SLEEPING_RUG: 34,
  WINDOW_WATCHING: 22,
  SHELF_SITTING: 15,
  WALKING: 15,
  KNOCKING_ITEM: 8,
  ZOOMIES: 6,
}

export interface PickContext {
  /** Последние состояния, новые — в конце */
  history: CatState[]
  mugOnShelf: boolean
  isNight: boolean
  /** Кота только что разбудили тапом — сразу снова спать он не пойдёт */
  justWoken: boolean
}

/**
 * Взвешенный случайный выбор. Против зацикливания:
 * - то же состояние два раза подряд невозможно;
 * - состояния из последних трёх получают половинный вес;
 * - кружку можно скинуть, только если она на полке; ночью кот спит вдвое охотнее.
 */
export function pickNextState(ctx: PickContext, random: () => number = Math.random): CatState {
  const last = ctx.history.at(-1)
  const recent = new Set(ctx.history.slice(-3))

  const weighted = (Object.keys(BASE_WEIGHTS) as CatState[]).map((state) => {
    let weight = BASE_WEIGHTS[state]
    if (state === last) weight = 0
    else if (recent.has(state)) weight *= 0.5
    if (state === 'KNOCKING_ITEM' && !ctx.mugOnShelf) weight = 0
    if (state === 'SLEEPING_RUG' && ctx.isNight) weight *= 2
    if (state === 'SLEEPING_RUG' && ctx.justWoken) weight = 0
    return { state, weight }
  })

  const total = weighted.reduce((sum, w) => sum + w.weight, 0)
  let roll = random() * total
  for (const { state, weight } of weighted) {
    roll -= weight
    if (roll < 0) return state
  }
  return weighted.findLast((w) => w.weight > 0)?.state ?? 'WALKING'
}

const randomBetween = (min: number, max: number, random: () => number) => min + random() * (max - min)
const seconds = (min: number, max: number, random: () => number) => Math.round(randomBetween(min, max, random) * 1000)

const WALK_MS = 2000 // переход между зонами — transition: transform 2s ease-in-out
const RUN_MS = 420

const faceTowards = (from: Point, to: Point, fallback: Facing): Facing =>
  Math.abs(to.x - from.x) < 4 ? fallback : to.x > from.x ? 1 : -1

const randomFloorPoint = (floor: RoomLayout['floor'], random: () => number): Point => ({
  x: Math.round(randomBetween(floor.minX, floor.maxX, random)),
  y: Math.round(randomBetween(floor.minY, floor.maxY, random)),
})

/**
 * Разворачивает состояние в шаги: при необходимости сначала дойти до якоря (поза walk, 2 с),
 * затем само занятие. Общая продолжительность состояния — 10–40 с.
 */
export function planState(state: CatState, from: CatFrame, layout: RoomLayout, random: () => number = Math.random): CatStep[] {
  const { anchors, floor } = layout
  const steps: CatStep[] = []
  let at: CatFrame = from

  const walkTo = (to: Point, pose: CatPose = 'walk', moveMs = WALK_MS) => {
    if (Math.hypot(to.x - at.x, to.y - at.y) < 6) return
    at = { state, pose, x: to.x, y: to.y, facing: faceTowards(at, to, at.facing), moveMs }
    steps.push({ frame: at, durationMs: moveMs })
  }
  const stay = (pose: CatPose, durationMs: number, facing: Facing = at.facing, effect?: CatStep['effect']) => {
    at = { ...at, state, pose, facing }
    steps.push({ frame: at, durationMs, effect })
  }

  switch (state) {
    case 'SLEEPING_RUG':
      walkTo(anchors.rug)
      stay('sleep', seconds(23, 38, random), at.facing, 'restoreMug') // пока кот спит, хозяин поднял кружку
      break
    case 'WINDOW_WATCHING':
      walkTo(anchors.windowSill)
      stay('sit', seconds(12, 30, random), random() < 0.5 ? 1 : -1)
      break
    case 'SHELF_SITTING':
      walkTo(anchors.shelf)
      stay('sit', seconds(10, 25, random), -1) // смотрит в комнату
      break
    case 'WALKING': {
      const hops = 3 + Math.floor(random() * 2)
      for (let i = 0; i < hops; i++) {
        walkTo(randomFloorPoint(floor, random))
        stay('sit', seconds(2, 5, random))
      }
      break
    }
    case 'ZOOMIES': {
      // Короткие быстрые рывки от стены к стене (крайние трети пола), потом отдышаться
      const dashes = 12 + Math.floor(random() * 5)
      const third = (floor.maxX - floor.minX) / 3
      for (let i = 0; i < dashes; i++) {
        const left = at.x > (floor.minX + floor.maxX) / 2
        const x = left ? randomBetween(floor.minX, floor.minX + third, random) : randomBetween(floor.maxX - third, floor.maxX, random)
        walkTo({ x: Math.round(x), y: Math.round(randomBetween(floor.minY, floor.maxY, random)) }, 'run', RUN_MS)
      }
      stay('sit', seconds(4, 6, random))
      break
    }
    case 'KNOCKING_ITEM':
      walkTo(anchors.shelfNearMug)
      stay('sit', 1500, 1) // прицеливается
      stay('swipe', 700, 1) // замах лапой
      stay('sit', seconds(8, 12, random), 1, 'knockMug') // кружка летит; кот невинно смотрит вниз
      break
  }

  // Гарантия 10–40 с на состояние
  const total = steps.reduce((sum, s) => sum + s.durationMs, 0)
  if (total < 10_000) stay(at.pose === 'run' ? 'sit' : at.pose, 10_000 - total)
  return steps
}

export const initialFrame = (layout: RoomLayout): CatFrame => ({ state: 'SLEEPING_RUG', pose: 'sleep', ...layout.anchors.rug, facing: 1, moveMs: 0 })
