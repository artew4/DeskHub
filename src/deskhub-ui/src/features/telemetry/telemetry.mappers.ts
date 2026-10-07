// Чистые функции подготовки телеметрии к отображению (без React)

export type StatusLevel = 'ok' | 'warn' | 'bad'

/** Пороги температуры SoC: < 60 °C — норма, 60–80 °C — тепло, ≥ 80 °C — перегрев (близко к троттлингу Pi 5). */
export function temperatureLevel(celsius: number): StatusLevel {
  if (celsius >= 80) return 'bad'
  if (celsius >= 60) return 'warn'
  return 'ok'
}

/** Пороги загрузки CPU/RAM: < 70 % — норма, 70–90 % — повышенная, > 90 % — критическая. */
export function loadLevel(percent: number): StatusLevel {
  if (percent > 90) return 'bad'
  if (percent >= 70) return 'warn'
  return 'ok'
}

/** 1 101 000 → «12д 17ч», 11 700 → «3ч 15м», 300 → «5м». */
export function formatUptime(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  if (days > 0) return `${days}д ${hours}ч`
  if (hours > 0) return `${hours}ч ${minutes}м`
  return `${minutes}м`
}

/** МБ → ГБ с одним знаком: 2150 → «2.1». */
export const mbToGb = (mb: number): string => (mb / 1024).toFixed(1)

// Полные имена классов — чтобы Tailwind нашёл их при сборке
export const levelText: Record<StatusLevel, string> = {
  ok: 'text-status-ok',
  warn: 'text-status-warn',
  bad: 'text-status-bad',
}

export const levelBg: Record<StatusLevel, string> = {
  ok: 'bg-status-ok',
  warn: 'bg-status-warn',
  bad: 'bg-status-bad',
}
