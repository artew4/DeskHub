// Окно показа пробок: будни (Пн–Пт), 10:00–13:20 включительно — время утренней поездки на работу.

const WINDOW_START_MINUTES = 10 * 60 // 10:00
const WINDOW_END_MINUTES = 13 * 60 + 20 // 13:20 (вся минута 13:20 входит в окно)

/** true — показывать пробки; false — на их месте живёт кот. Локальное время устройства. */
export function isTrafficWindow(date: Date): boolean {
  const weekday = date.getDay() // 0 = Вс, 6 = Сб
  if (weekday === 0 || weekday === 6) return false
  const minutes = date.getHours() * 60 + date.getMinutes()
  return minutes >= WINDOW_START_MINUTES && minutes <= WINDOW_END_MINUTES
}
