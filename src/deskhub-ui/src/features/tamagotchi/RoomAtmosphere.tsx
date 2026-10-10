import { memo } from 'react'
import { SkyClouds, SkyFog, SkyLightning, SkyPrecipitation } from '../sky/SkyEffects'
import type { RoomLayout } from './catStates'
import { LAMP_X, WINDOW, hasPrecipitation, isOvercast, type RoomPhase, type SkyCondition } from './roomEnvironment'

// ─── Погода за окном ─────────────────────────────────────────────────────────
// HTML-слой ровно поверх стекла окна (WINDOW.glass в координатах комнаты). Сами эффекты — общий модуль
// features/sky/SkyEffects.tsx (его же использует Hero-виджет погоды).

const GLASS = WINDOW.glass

/** Облака, туман, дождь, снег, молния — по реальной погоде (wttr.in → WeatherModel.icon). */
export const WindowWeather = memo(function WindowWeather({ phase, sky, layout }: { phase: RoomPhase; sky: SkyCondition; layout: RoomLayout }) {
  return (
    <div
      className="pointer-events-none absolute overflow-hidden"
      style={{ left: GLASS.x, top: GLASS.y + layout.verticalShift, width: GLASS.width, height: GLASS.height }}
      aria-hidden
    >
      <SkyClouds phase={phase} sky={sky} area={GLASS} />
      <SkyFog phase={phase} sky={sky} />
      <SkyPrecipitation sky={sky} area={GLASS} />
      <SkyLightning sky={sky} />
    </div>
  )
})

// ─── Освещение комнаты ───────────────────────────────────────────────────────

/**
 * Слой освещения между комнатой и котом: затемняет/тонирует комнату (и кружку, и клубок), но не кота —
 * он рисуется поверх и остаётся читаемым. Меняется 4 раза в сутки — плавным кроссфейдом за 3 с.
 * Ночью — тёмная виньетка с «пятном» света под лампой; в пасмурную/дождливую погоду днём — лёгкая серость.
 */
export const RoomLighting = memo(function RoomLighting({ phase, sky, layout }: { phase: RoomPhase; sky: SkyCondition; layout: RoomLayout }) {
  const lampX = LAMP_X + layout.centerShift
  const lampY = layout.floorTop - 30
  const gloom = (isOvercast(sky) || hasPrecipitation(sky)) && (phase === 'morning' || phase === 'day')

  // Градиенты не анимируются transition'ом, поэтому каждая фаза — свой постоянный слой,
  // а смена фазы — плавный кроссфейд opacity за 3 с (композиция на GPU, без перерисовки)
  // База комнаты светлая: утро и день — свет из окна (тёплый / нейтральный), без затемнения;
  // вечер и ночь — уютный полумрак плотнее прежнего, со светлым пятном под лампой
  const phaseLayers: Record<RoomPhase, string | null> = {
    morning: 'linear-gradient(100deg, rgba(255,214,170,0.24), rgba(255,214,170,0.05) 65%)',
    day: 'linear-gradient(100deg, rgba(255,255,240,0.14), rgba(255,255,240,0) 60%)',
    evening: `radial-gradient(ellipse 220px 240px at ${lampX}px ${lampY}px, rgba(255,170,90,0.12), rgba(58,28,48,0.52) 90%)`,
    night: `radial-gradient(ellipse 160px 210px at ${lampX}px ${lampY}px, rgba(255,196,110,0.10), rgba(8,10,24,0.80) 85%)`,
  }

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {(Object.keys(phaseLayers) as RoomPhase[]).map((p) =>
        phaseLayers[p] ? (
          <div
            key={p}
            className="absolute inset-0"
            style={{ background: phaseLayers[p]!, opacity: p === phase ? 1 : 0, transition: 'opacity 3s ease-in-out' }}
          />
        ) : null,
      )}
      <div className="absolute inset-0" style={{ background: 'rgba(70,80,95,0.16)', opacity: gloom ? 1 : 0, transition: 'opacity 3s ease-in-out' }} />
    </div>
  )
})
