import { useClock } from '../clock/useClock'
import { isTrafficWindow } from './trafficWindow'

/** Пересчитывается на границе каждой минуты: переключение ровно в 10:00 и в 13:21. */
export function useTrafficWindow(): boolean {
  return isTrafficWindow(useClock('minute'))
}
