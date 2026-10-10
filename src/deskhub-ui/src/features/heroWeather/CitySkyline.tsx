import { memo } from 'react'
import { SKYLINE_COLOR, lampOn, type RoomPhase } from '../tamagotchi/roomEnvironment'

// Силуэт города в базовой ширине 572 (ячейка 7×3), прижат к низу; на другой ширине — обрезается по краям (slice).
const FAR = 'M0,80 L0,40 L22,40 L22,30 L40,30 L40,44 L64,44 L64,22 L78,22 L78,14 L84,14 L84,22 L98,22 L98,46 L130,46 L130,34 L156,34 L156,50 L182,50 L182,26 L206,26 L206,42 L240,42 L240,30 L262,30 L262,48 L296,48 L296,20 L304,10 L312,20 L312,44 L344,44 L344,32 L372,32 L372,50 L398,50 L398,24 L420,24 L420,40 L452,40 L452,28 L474,28 L474,46 L506,46 L506,18 L520,18 L520,38 L546,38 L546,30 L572,30 L572,80 Z'
const NEAR = 'M0,80 L0,56 L30,56 L30,46 L52,46 L52,60 L88,60 L88,40 L112,40 L112,54 L140,54 L140,48 L170,48 L170,62 L196,62 L196,36 L214,36 L214,30 L224,30 L224,36 L242,36 L242,58 L276,58 L276,50 L310,50 L310,64 L334,64 L334,44 L362,44 L362,56 L392,56 L392,38 L414,38 L414,60 L446,60 L446,48 L478,48 L478,58 L500,58 L500,42 L528,42 L528,54 L552,54 L552,46 L572,46 L572,80 Z'
const WINDOWS: [number, number][] = [
  [36, 52], [44, 58], [94, 46], [100, 52], [118, 58], [146, 56], [202, 42], [208, 50], [230, 40], [250, 62], [284, 56], [342, 50], [350, 58], [368, 60], [398, 44], [404, 52], [454, 54], [508, 48], [514, 56], [536, 58], [560, 52],
]

/** Два плана силуэта: дальний светлее (дымка), ближний — цвета фазы; вечером и ночью светятся окна. */
export const CitySkyline = memo(function CitySkyline({ phase }: { phase: RoomPhase }) {
  const lit = lampOn(phase)
  const color = SKYLINE_COLOR[phase]
  return (
    <svg className="absolute inset-x-0 bottom-0 h-[29%] w-full" viewBox="0 0 572 80" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <path d={FAR} style={{ fill: color, opacity: 0.55, transition: 'fill 3s ease-in-out' }} />
      <path d={NEAR} style={{ fill: color, transition: 'fill 3s ease-in-out' }} />
      <g style={{ opacity: lit ? 0.85 : 0, transition: 'opacity 3s ease-in-out' }}>
        {WINDOWS.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width={3} height={3.5} fill="#F5C451" />)}
      </g>
    </svg>
  )
})
