// Построение сетки месяца — чистые функции на нативном Date, неделя начинается с понедельника.

export interface CalendarDay {
  day: number
  isToday: boolean
  isPast: boolean
  isWeekend: boolean
}

/** Ячейка сетки: день месяца или пустая ячейка-отступ перед первым числом. */
export type CalendarCell = CalendarDay | null

export const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

/** getDay(): 0 = воскресенье … 6 = суббота → индекс в неделе с понедельника: 0 = Пн … 6 = Вс. */
export const mondayIndex = (date: Date): number => (date.getDay() + 6) % 7

export function buildMonthGrid(today: Date): CalendarCell[] {
  const year = today.getFullYear()
  const month = today.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate() // 0-й день следующего месяца = последний день текущего
  const leading = mondayIndex(new Date(year, month, 1))

  const cells: CalendarCell[] = Array.from({ length: leading }, () => null)
  for (let day = 1; day <= daysInMonth; day++) {
    const weekday = (leading + day - 1) % 7
    cells.push({
      day,
      isToday: day === today.getDate(),
      isPast: day < today.getDate(),
      isWeekend: weekday >= 5,
    })
  }
  return cells
}

const monthFormat = new Intl.DateTimeFormat('ru-RU', { month: 'long' })

/** «Октябрь 2026» (именительный падеж — standalone-форма Intl). */
export function formatMonthTitle(date: Date): string {
  const month = monthFormat.format(date)
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${date.getFullYear()}`
}
