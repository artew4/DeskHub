import { create } from 'zustand'

/** Программная яркость интерфейса, %: ниже 10 % текст уже не читается. */
export const MIN_BRIGHTNESS = 10
export const MAX_BRIGHTNESS = 100

const KEYS = {
  brightness: 'deskhub.brightness',
  forceLightTheme: 'deskhub.forceLightTheme',
  nightShiftEnabled: 'deskhub.nightShift',
} as const

const clamp = (value: number) => Math.round(Math.min(MAX_BRIGHTNESS, Math.max(MIN_BRIGHTNESS, value)))

/** localStorage может быть недоступен (приватный режим, заблокированное хранилище) — тогда значения живут до перезагрузки. */
function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // нет хранилища — настройка работает до перезагрузки
  }
}

/** Сохранённый уровень; нет значения или мусор — 100 %. */
function loadBrightness(): number {
  const stored = Number(read(KEYS.brightness))
  return stored ? clamp(stored) : MAX_BRIGHTNESS
}

interface DisplaySettingsState {
  brightness: number
  /** Всегда светлая тема (как днём), независимо от времени суток — тест читаемости TN-матрицы под углом. */
  forceLightTheme: boolean
  /** Тёплый полупрозрачный слой поверх всего UI. */
  nightShiftEnabled: boolean
  /**
   * Режим «Второй экран ПК» (Spacedesk HTML5 Viewer поверх всего UI). Не сохраняется в localStorage:
   * после перезагрузки страницы киоск всегда возвращается к дашборду (ПК может быть выключен).
   */
  isSpacedeskActive: boolean
  setBrightness: (value: number) => void
  setForceLightTheme: (enabled: boolean) => void
  setNightShiftEnabled: (enabled: boolean) => void
  openSpacedesk: () => void
  closeSpacedesk: () => void
}

/**
 * Настройки этого экрана (localStorage браузера киоска): переживают перезагрузку страницы и деплой (InstanceId-reload),
 * но не перезапуск Chromium — kiosk.sh пересоздаёт профиль. Сервер о них не знает; отдельно от данных дашборда.
 */
export const useDisplaySettingsStore = create<DisplaySettingsState>((set, get) => ({
  brightness: loadBrightness(),
  forceLightTheme: read(KEYS.forceLightTheme) === 'true',
  nightShiftEnabled: read(KEYS.nightShiftEnabled) === 'true',
  setBrightness: (value) => {
    const brightness = clamp(value)
    if (brightness === get().brightness) return
    set({ brightness })
    write(KEYS.brightness, String(brightness))
  },
  setForceLightTheme: (forceLightTheme) => {
    set({ forceLightTheme })
    write(KEYS.forceLightTheme, String(forceLightTheme))
  },
  setNightShiftEnabled: (nightShiftEnabled) => {
    set({ nightShiftEnabled })
    write(KEYS.nightShiftEnabled, String(nightShiftEnabled))
  },
  isSpacedeskActive: false,
  openSpacedesk: () => set({ isSpacedeskActive: true }),
  closeSpacedesk: () => set({ isSpacedeskActive: false }),
}))
