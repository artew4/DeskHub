import { create } from 'zustand'

/** Программная яркость интерфейса, %: ниже 10 % текст уже не читается. */
export const MIN_BRIGHTNESS = 10
export const MAX_BRIGHTNESS = 100

const STORAGE_KEY = 'deskhub.brightness'

const clamp = (value: number) => Math.round(Math.min(MAX_BRIGHTNESS, Math.max(MIN_BRIGHTNESS, value)))

/** Сохранённый уровень; нет значения, мусор или localStorage недоступен — 100 %. */
function loadBrightness(): number {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY))
    return stored ? clamp(stored) : MAX_BRIGHTNESS
  } catch {
    return MAX_BRIGHTNESS
  }
}

interface BrightnessState {
  brightness: number
  setBrightness: (value: number) => void
}

/**
 * Отдельный от данных дашборда стор: яркость — настройка этого экрана (localStorage браузера киоска),
 * переживает перезагрузку страницы и обновление контейнера; сервер о ней не знает.
 */
export const useBrightnessStore = create<BrightnessState>((set, get) => ({
  brightness: loadBrightness(),
  setBrightness: (value) => {
    const brightness = clamp(value)
    if (brightness === get().brightness) return
    set({ brightness })
    try {
      localStorage.setItem(STORAGE_KEY, String(brightness))
    } catch {
      // Приватный режим / заблокированное хранилище: яркость работает до перезагрузки
    }
  },
}))
