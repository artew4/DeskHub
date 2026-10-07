import type { CongestionLevel, RouteModel } from '../../types/dashboard'

/** Порог устаревания: бэкенд обновляет пробки раз в 5 мин. Устаревшее время в пути вводит в заблуждение. */
export const TRAFFIC_STALE_AFTER_MS = 10 * 60_000

export const congestionLabel: Record<CongestionLevel, string> = {
  free: 'Свободно',
  normal: 'Затруднено',
  heavy: 'Пробки',
  severe: 'Сильные пробки',
}

// Полные имена классов — чтобы Tailwind нашёл их при сборке. Линия и время используют один цвет.
export const congestionStroke: Record<CongestionLevel, string> = {
  free: 'stroke-status-ok',
  normal: 'stroke-status-warn',
  heavy: 'stroke-status-bad',
  severe: 'stroke-status-critical',
}

export const congestionFill: Record<CongestionLevel, string> = {
  free: 'fill-status-ok',
  normal: 'fill-status-warn',
  heavy: 'fill-status-bad',
  severe: 'fill-status-critical',
}

/** 45 → «45 мин», 72 → «1 ч 12 мин», 60 → «1 ч». */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`
}

/** Самый быстрый маршрут и выигрыш относительно следующего; null, если маршрутов < 2 или время равно. */
export function fastestRoute(routes: RouteModel[]): { id: string; savesMinutes: number } | null {
  if (routes.length < 2) return null
  const [first, second] = [...routes].sort((a, b) => a.durationMinutes - b.durationMinutes)
  const saves = second.durationMinutes - first.durationMinutes
  return saves > 0 ? { id: first.id, savesMinutes: saves } : null
}
