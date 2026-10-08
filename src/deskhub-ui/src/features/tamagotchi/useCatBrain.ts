import { useCallback, useEffect, useRef, useState } from 'react'
import { initialFrame, pickNextState, planState, type CatFrame, type CatState, type CatStep, type RoomLayout } from './catStates'

export interface CatBrain {
  frame: CatFrame
  mugOnShelf: boolean
  /** Метка последнего тапа по коту — для реакции (сердечко) */
  pokedAt: number | null
  poke: () => void
}

/**
 * Проигрывает план кота шаг за шагом цепочкой setTimeout. Когда шаги кончаются —
 * выбирает следующее состояние (pickNextState) и планирует его (planState).
 * React-состояние меняется только на границах шагов (раз в 0.4–40 с), не каждый кадр.
 */
export function useCatBrain(isNight: boolean, layout: RoomLayout): CatBrain {
  const [frame, setFrame] = useState<CatFrame>(() => initialFrame(layout))
  const [mugOnShelf, setMugOnShelf] = useState(true)
  const [pokedAt, setPokedAt] = useState<number | null>(null)

  // Рефы — актуальные значения для планировщика внутри таймеров
  const frameRef = useRef(frame)
  const mugRef = useRef(true)
  const nightRef = useRef(isNight)
  const layoutRef = useRef(layout)
  const history = useRef<CatState[]>(['SLEEPING_RUG'])
  const queue = useRef<CatStep[]>([])
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const justWoken = useRef(false)

  useEffect(() => {
    nightRef.current = isNight
    layoutRef.current = layout
  }, [isNight, layout])

  /** Запуск следующего шага; присваивается в эффекте ниже (нужен poke для пробуждения). */
  const runNextStep = useRef<() => void>(() => {})

  useEffect(() => {
    const run = () => {
      if (queue.current.length === 0) {
        const next = pickNextState({
          history: history.current,
          mugOnShelf: mugRef.current,
          isNight: nightRef.current,
          justWoken: justWoken.current,
        })
        justWoken.current = false
        history.current = [...history.current.slice(-5), next]
        queue.current = planState(next, frameRef.current, layoutRef.current)
      }

      const step = queue.current.shift()!
      if (step.effect === 'knockMug') mugRef.current = false
      if (step.effect === 'restoreMug') mugRef.current = true
      setMugOnShelf(mugRef.current)
      frameRef.current = step.frame
      setFrame(step.frame)
      timer.current = setTimeout(run, step.durationMs)
    }

    runNextStep.current = run
    // Первый сон — короткий, чтобы кот «ожил» вскоре после появления
    timer.current = setTimeout(run, 8_000)
    return () => clearTimeout(timer.current)
  }, [])

  /** Тап по коту: сердечко; спящий кот просыпается и сразу занимается чем-то другим. */
  const poke = useCallback(() => {
    setPokedAt(Date.now())
    if (frameRef.current.pose === 'sleep') {
      clearTimeout(timer.current)
      queue.current = []
      justWoken.current = true
      timer.current = setTimeout(() => runNextStep.current(), 900) // потянуться
    }
  }, [])

  return { frame, mugOnShelf, pokedAt, poke }
}
