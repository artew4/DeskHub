// Углы стрелок в градусах (0° — «12 часов», по часовой стрелке). Чистые функции — без DOM.

export interface HandAngles {
  hour: number
  minute: number
  second: number
}

/**
 * Все стрелки непрерывные: секундная учитывает миллисекунды (sweeping hand),
 * минутная — секунды, часовая — минуты. smoothSeconds = false — дискретный «тик» раз в секунду.
 */
export function handAngles(date: Date, smoothSeconds = true): HandAngles {
  const ms = date.getMilliseconds()
  const seconds = date.getSeconds() + (smoothSeconds ? ms / 1000 : 0)
  const minutes = date.getMinutes() + (date.getSeconds() + ms / 1000) / 60
  const hours = (date.getHours() % 12) + minutes / 60
  return { hour: hours * 30, minute: minutes * 6, second: seconds * 6 }
}
