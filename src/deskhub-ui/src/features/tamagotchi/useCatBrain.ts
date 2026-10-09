import { useCallback, useEffect, useRef, useState } from 'react'
import {
  initialFrame,
  pickNextState,
  planReaction,
  planState,
  reactionForTap,
  type CatFrame,
  type CatReactionKind,
  type CatState,
  type CatStep,
  type Point,
  type RoomLayout,
} from './catStates'
import type { RoomPhase } from './roomEnvironment'

/** Клубок: позиция и накопленный угол вращения (катится без проскальзывания). */
export interface YarnState extends Point {
  angle: number
}

export const YARN_RADIUS = 9

export interface CatBrain {
  frame: CatFrame
  mugOnShelf: boolean
  yarn: YarnState
  /** Последняя реакция на человека (для всплывающих сердечек / «!» / значка раздражения); at — ключ анимации */
  reaction: { kind: CatReactionKind; at: number } | null
  /** Тап по коту */
  poke: () => void
  /** Экран включили ночью (powerMode sleep → dimmed): испуг */
  startle: () => void
}

/** Первый сон после появления виджета — короткий, чтобы кот вскоре «ожил». */
const FIRST_NAP_MS = 15_000

/**
 * Проигрывает план кота шаг за шагом цепочкой setTimeout. Когда шаги кончаются —
 * выбирает следующее состояние (pickNextState) и планирует его (planState).
 * React-состояние меняется только на границах шагов (раз в 0.35–180 с), не каждый кадр.
 */
/** Внешний мир кота: фаза суток и осадки за окном (меняют веса выбора занятий). */
export interface CatEnvironment {
  phase: RoomPhase
  precipitation: boolean
}

export function useCatBrain(env: CatEnvironment, layout: RoomLayout): CatBrain {
  const [frame, setFrame] = useState<CatFrame>(() => initialFrame(layout))
  const [mugOnShelf, setMugOnShelf] = useState(true)
  const [yarn, setYarn] = useState<YarnState>(() => ({ ...layout.anchors.yarnHome, angle: 0 }))
  const [reaction, setReaction] = useState<CatBrain['reaction']>(null)

  // Рефы — актуальные значения для планировщика внутри таймеров
  const frameRef = useRef(frame)
  const mugRef = useRef(true)
  const yarnRef = useRef(yarn)
  const envRef = useRef(env)
  const layoutRef = useRef(layout)
  const history = useRef<CatState[]>(['SLEEPING_RUG'])
  const queue = useRef<CatStep[]>([])
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    envRef.current = env
    layoutRef.current = layout
  }, [env, layout])

  /** Запуск следующего шага; присваивается в эффекте ниже (нужен poke для пробуждения). */
  const runNextStep = useRef<() => void>(() => {})

  useEffect(() => {
    const run = () => {
      if (queue.current.length === 0) {
        const next = pickNextState({
          history: history.current,
          mugOnShelf: mugRef.current,
          phase: envRef.current.phase,
          precipitation: envRef.current.precipitation,
        })
        history.current = [...history.current.slice(-5), next]
        queue.current = planState(next, frameRef.current, layoutRef.current, { yarn: yarnRef.current })
      }

      const step = queue.current.shift()!
      if (step.effect === 'knockMug') mugRef.current = false
      if (step.effect === 'restoreMug') mugRef.current = true
      setMugOnShelf(mugRef.current)
      if (step.yarn) {
        // Угол качения = пройденный путь / радиус
        const rolled = ((step.yarn.x - yarnRef.current.x) / YARN_RADIUS) * (180 / Math.PI)
        yarnRef.current = { ...step.yarn, angle: yarnRef.current.angle + rolled }
        setYarn(yarnRef.current)
      }
      frameRef.current = step.frame
      setFrame(step.frame)
      timer.current = setTimeout(run, step.durationMs)
    }

    runNextStep.current = run
    timer.current = setTimeout(run, FIRST_NAP_MS)
    return () => clearTimeout(timer.current)
  }, [])

  /** Прервать текущий план и сразу начать шаги реакции. */
  const react = useCallback((kind: CatReactionKind) => {
    setReaction({ kind, at: Date.now() })
    const steps = planReaction(kind, frameRef.current, layoutRef.current, { yarn: yarnRef.current })
    if (!steps) return // кот и так активен — только всплывающая реакция
    clearTimeout(timer.current)
    const next = steps.at(-1)!.frame.state
    history.current = [...history.current.slice(-5), next]
    queue.current = steps
    runNextStep.current()
  }, [])

  /** Тап: спящий — недовольно просыпается и потягивается; бодрствующий — сердечки (и, может, игра с клубком). */
  const poke = useCallback(() => react(reactionForTap(frameRef.current)), [react])

  /** Внезапно включили свет (экран вышел из ночного Sleep): испуг. */
  const startle = useCallback(() => react('startle'), [react])

  return { frame, mugOnShelf, yarn, reaction, poke, startle }
}
