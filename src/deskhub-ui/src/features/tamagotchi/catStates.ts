// «Кошачий мозг»: состояния, веса, тайминги, якоря комнаты и планирование шагов. Чистые функции — без React и таймеров.

export type CatState =
  | 'SLEEPING_RUG'
  | 'WINDOW_WATCHING'
  | 'SHELF_SITTING'
  | 'GROOMING'
  | 'STRETCHING'
  | 'WALKING'
  | 'PLAYING_YARN'
  | 'ZOOMIES'
  | 'KNOCKING_ITEM'

/** Поза определяет, какой рисунок кота показывать. */
export type CatPose = 'sit' | 'sleep' | 'walk' | 'run' | 'swipe' | 'stretch' | 'groom' | 'play'

export type Facing = 1 | -1

export interface Point {
  x: number
  y: number
}

/** Кадр, который видит пользователь: состояние, поза, точка «лап» кота в координатах комнаты. */
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
  /** Клубок откатывается в эту точку в начале шага */
  yarn?: Point
}

/** Что ещё есть в комнате и влияет на план (меняется по ходу жизни кота). */
export interface WorldState {
  yarn: Point
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
    /** Где кот умывается — на краю коврика */
    groomSpot: Point
    /** Где клубок лежит изначально — на полу слева от коврика */
    yarnHome: Point
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
      groomSpot: { x: 346 + centerShift, y: floorTop + 40 },
      yarnHome: { x: 168, y: floorTop + 46 },
    },
    floor: { minX: 70, maxX: w - 54, minY: floorTop + 36, maxY: floorTop + 48 },
  }
}

/** Для aria-label (на экране не выводится). */
export const STATE_LABELS: Record<CatState, string> = {
  SLEEPING_RUG: 'спит на коврике',
  WINDOW_WATCHING: 'смотрит в окно',
  SHELF_SITTING: 'сидит на полке',
  GROOMING: 'умывается',
  STRETCHING: 'потягивается',
  WALKING: 'гуляет по комнате',
  PLAYING_YARN: 'играет с клубком',
  ZOOMIES: 'носится как угорелый',
  KNOCKING_ITEM: 'скидывает кружку',
}

/**
 * Базовые веса. Живой кот в основном спит и сидит, изредка играет и совсем редко бесится.
 * STRETCHING случайно не выбирается — это реакция на пробуждение (см. pickNextState).
 */
const BASE_WEIGHTS: Record<CatState, number> = {
  SLEEPING_RUG: 30,
  WINDOW_WATCHING: 18,
  SHELF_SITTING: 12,
  GROOMING: 12,
  WALKING: 10,
  PLAYING_YARN: 7,
  ZOOMIES: 6,
  KNOCKING_ITEM: 5,
  STRETCHING: 0,
}

/** Вероятность потянуться после сна. */
const STRETCH_AFTER_SLEEP = 0.8

export interface PickContext {
  /** Последние состояния, новые — в конце */
  history: CatState[]
  mugOnShelf: boolean
  isNight: boolean
  /** Кота только что разбудили тапом */
  justWoken: boolean
}

/**
 * Взвешенный случайный выбор следующего состояния:
 * - разбудили тапом — всегда потягушки; проснулся сам — потягушки с вероятностью 80 %;
 * - после «тыгыдыка» кот выдохся: сон и умывание ×3;
 * - то же состояние два раза подряд невозможно, состояния из последних трёх — половинный вес;
 * - ночью сон ×2, «тыгыдык» ×0.5; кружку можно скинуть, только если она на полке.
 */
export function pickNextState(ctx: PickContext, random: () => number = Math.random): CatState {
  const last = ctx.history.at(-1)
  if (ctx.justWoken) return 'STRETCHING'
  if (last === 'SLEEPING_RUG' && random() < STRETCH_AFTER_SLEEP) return 'STRETCHING'

  const recent = new Set(ctx.history.slice(-3))
  const weighted = (Object.keys(BASE_WEIGHTS) as CatState[]).map((state) => {
    let weight = BASE_WEIGHTS[state]
    if (state === last) weight = 0
    else if (recent.has(state)) weight *= 0.5
    if (last === 'ZOOMIES' && (state === 'SLEEPING_RUG' || state === 'GROOMING')) weight *= 3
    if (ctx.isNight && state === 'SLEEPING_RUG') weight *= 2
    if (ctx.isNight && state === 'ZOOMIES') weight *= 0.5
    if (state === 'KNOCKING_ITEM' && !ctx.mugOnShelf) weight = 0
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

// ─── Тайминги ───────────────────────────────────────────────────────────────

/** Длительность занятия (без дороги до места), секунды. */
export const DURATIONS_S = {
  calm: [40, 180], // сон, окно, полка — можно позалипать
  grooming: [10, 20],
  stretching: [3, 5],
  walking: [10, 20], // вся прогулка, включая шаги
  playingYarn: [10, 15], // игра, без подхода к клубку
  zoomies: [5, 12], // вся вспышка, включая «отдышаться»
} as const

/** Скорость спокойного шага: переход через всю комнату (~300 px) ≈ 3 с. */
const WALK_PX_PER_MS = 0.11
const WALK_MIN_MS = 2200
const WALK_MAX_MS = 5000
const RUN_MS = 450
/** Насколько далеко от клубка стоит кот (передние лапы касаются клубка). */
const YARN_REACH = 26

const randomBetween = (min: number, max: number, random: () => number) => min + random() * (max - min)
const ms = ([min, max]: readonly [number, number], random: () => number) => Math.round(randomBetween(min, max, random) * 1000)
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Время спокойного перехода — от расстояния, чтобы короткий шаг не тянулся, а длинный не был рывком. */
export const walkMs = (from: Point, to: Point) =>
  Math.round(clamp(Math.hypot(to.x - from.x, to.y - from.y) / WALK_PX_PER_MS, WALK_MIN_MS, WALK_MAX_MS))

const faceTowards = (from: Point, to: Point, fallback: Facing): Facing =>
  Math.abs(to.x - from.x) < 4 ? fallback : to.x > from.x ? 1 : -1

const randomFloorPoint = (floor: RoomLayout['floor'], random: () => number): Point => ({
  x: Math.round(randomBetween(floor.minX, floor.maxX, random)),
  y: Math.round(randomBetween(floor.minY, floor.maxY, random)),
})

/**
 * Разворачивает состояние в шаги: при необходимости сначала дойти до места (поза walk, 2.2–5 с по расстоянию),
 * затем само занятие с длительностью из DURATIONS_S.
 */
export function planState(
  state: CatState,
  from: CatFrame,
  layout: RoomLayout,
  world: WorldState,
  random: () => number = Math.random,
): CatStep[] {
  const { anchors, floor } = layout
  const steps: CatStep[] = []
  let at: CatFrame = from
  let elapsed = 0

  const walkTo = (to: Point, pose: CatPose = 'walk', moveMs = walkMs(at, to)) => {
    if (Math.hypot(to.x - at.x, to.y - at.y) < 6) return 0
    at = { state, pose, x: to.x, y: to.y, facing: faceTowards(at, to, at.facing), moveMs }
    steps.push({ frame: at, durationMs: moveMs })
    elapsed += moveMs
    return moveMs
  }
  const stay = (pose: CatPose, durationMs: number, facing: Facing = at.facing, extra: Omit<CatStep, 'frame' | 'durationMs'> = {}) => {
    if (durationMs <= 0) return
    at = { ...at, state, pose, facing }
    steps.push({ frame: at, durationMs, ...extra })
    elapsed += durationMs
  }

  switch (state) {
    case 'SLEEPING_RUG':
      walkTo(anchors.rug)
      stay('sleep', ms(DURATIONS_S.calm, random), at.facing, { effect: 'restoreMug' }) // пока кот спит, хозяин поднял кружку
      break

    case 'WINDOW_WATCHING':
      walkTo(anchors.windowSill)
      stay('sit', ms(DURATIONS_S.calm, random), random() < 0.5 ? 1 : -1)
      break

    case 'SHELF_SITTING':
      walkTo(anchors.shelf)
      stay('sit', ms(DURATIONS_S.calm, random), -1) // смотрит в комнату
      break

    case 'GROOMING':
      walkTo(anchors.groomSpot)
      stay('groom', ms(DURATIONS_S.grooming, random), random() < 0.5 ? 1 : -1)
      break

    case 'STRETCHING':
      stay('stretch', ms(DURATIONS_S.stretching, random)) // на месте, где проснулся
      break

    case 'WALKING': {
      const target = ms(DURATIONS_S.walking, random)
      while (elapsed < target) {
        const next = randomFloorPoint(floor, random)
        if (elapsed + walkMs(at, next) > target) break
        walkTo(next)
        stay('sit', Math.min(ms([2, 4], random), target - elapsed))
      }
      stay('sit', target - elapsed)
      break
    }

    case 'ZOOMIES': {
      // Рывки от стены к стене (крайние трети пола), в конце — отдышаться 1.5–2.5 с; всего строго 5–12 с
      const target = ms(DURATIONS_S.zoomies, random)
      const pant = ms([1.5, 2.5], random)
      const third = (floor.maxX - floor.minX) / 3
      while (elapsed + RUN_MS <= target - pant) {
        const left = at.x > (floor.minX + floor.maxX) / 2
        const x = left ? randomBetween(floor.minX, floor.minX + third, random) : randomBetween(floor.maxX - third, floor.maxX, random)
        if (walkTo({ x: Math.round(x), y: Math.round(randomBetween(floor.minY, floor.maxY, random)) }, 'run', RUN_MS) === 0) break
      }
      stay('sit', target - elapsed)
      break
    }

    case 'PLAYING_YARN': {
      // Подойти к клубку → бить лапками → пнуть (клубок катится) → прыгнуть следом → … 10–15 с игры
      let yarn = world.yarn
      let side: Facing = at.x <= yarn.x ? 1 : -1
      walkTo({ x: yarn.x - side * YARN_REACH, y: yarn.y - 2 })
      const playStart = elapsed
      const target = ms(DURATIONS_S.playingYarn, random)
      while (elapsed - playStart < target) {
        stay('play', Math.min(ms([1.8, 3.2], random), target - (elapsed - playStart)), side)
        if (elapsed - playStart >= target - 1000) break
        // Пинок: клубок откатывается на 40–90 px (от стены — в обратную сторону)
        let dir: Facing = random() < 0.7 ? side : (-side as Facing)
        const distance = randomBetween(40, 90, random)
        if (yarn.x + dir * distance < floor.minX + 20 || yarn.x + dir * distance > floor.maxX - 20) dir = -dir as Facing
        yarn = { x: Math.round(yarn.x + dir * distance), y: yarn.y }
        stay('play', 350, side, { yarn })
        // Прыжок следом
        side = at.x <= yarn.x ? 1 : -1
        const pounceTo = { x: yarn.x - side * YARN_REACH, y: yarn.y - 2 }
        walkTo(pounceTo, 'run', Math.round(clamp(Math.abs(pounceTo.x - at.x) / 0.3, 450, 900)))
      }
      stay('play', target - (elapsed - playStart), side) // добрать до 10–15 с игры
      break
    }

    case 'KNOCKING_ITEM':
      walkTo(anchors.shelfNearMug)
      stay('sit', 1500, 1) // прицеливается
      stay('swipe', 700, 1) // замах лапой
      stay('sit', ms([6, 10], random), 1, { effect: 'knockMug' }) // кружка летит; кот невинно смотрит вниз
      break
  }

  if (steps.length === 0) stay('sit', 3000) // страховка: план не может быть пустым
  return steps
}

export const initialFrame = (layout: RoomLayout): CatFrame => ({
  state: 'SLEEPING_RUG',
  pose: 'sleep',
  ...layout.anchors.rug,
  facing: 1,
  moveMs: 0,
})
