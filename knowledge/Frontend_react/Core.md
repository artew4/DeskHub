# Frontend Core — каркас React-приложения

> **Назначение документа:** базовая архитектура SPA DeskHub: структура проекта, навигация, управление состоянием, UI-кит под 1024×600 и тач, интеграция SignalR-клиента.
> Общие правила стека — в [`01_Frontend_TechStack.md`](01_Frontend_TechStack.md).

---

## 1. Структура проекта

```
src/deskhub-ui/
├── index.html
├── vite.config.ts
├── tailwind.config.js       # Tailwind v3
├── postcss.config.js
├── tsconfig.json
└── src/
    ├── main.tsx                  # точка входа, монтирование <App/>
    ├── app/
    │   ├── App.tsx               # корневой лэйаут 1024×600, провайдеры
    │   ├── AppShell.tsx          # экраны + оверлеи (статус связи, ночной режим)
    │   ├── KioskGuards.tsx       # блокировка контекстного меню, жестов, курсора
    │   └── DevFrame.tsx          # только DEV: рамка 1024×600 в центре окна
    ├── features/
    │   ├── dashboard/            # главный экран, часы, сетка (Feature_Dashboard.md)
    │   ├── weather/              # виджет погоды           (Feature_Widgets.md)
    │   ├── traffic/              # виджет пробок           (Feature_Widgets.md)
    │   └── telemetry/            # виджет телеметрии       (Feature_Widgets.md)
    ├── shared/
    │   ├── api/
    │   │   ├── types.ts          # DTO, зеркалящие C#-модели
    │   │   ├── hubEvents.ts      # константы имён событий SignalR
    │   │   ├── rest.ts           # fetch-обёртка (snapshot, команды)
    │   │   └── signalr/
    │   │       ├── connection.ts # singleton HubConnection
    │   │       ├── bindings.ts   # маппинг событий хаба → actions стора
    │   │       └── useHubStatus.ts
    │   ├── store/
    │   │   ├── index.ts          # корневой Zustand-стор (слайсы)
    │   │   └── connectionSlice.ts
    │   ├── ui/                   # UI-кит: Card, Grid, Stat, Badge, TouchButton, Skeleton...
    │   ├── lib/                  # cn(), форматтеры, ringBuffer, time utils, logger
    │   └── hooks/                # useNow, useInterval, useStale, useCanvas
    └── styles/
        └── index.css             # tailwind + kiosk reset + @font-face
```

Принцип: фича владеет своими компонентами, слайсом стора, маппингом DTO и тестами. `shared/` не импортирует из `features/`.

### 1.1. Текущее состояние (Core Communication Layer)

Дерево выше — **целевая** структура. Сейчас реализованы слой связи и первый виджет; общие модули пока лежат в упрощённой раскладке:

| Файл | Роль | Целевое место |
|---|---|---|
| `src/types/dashboard.ts` | TS-зеркало C#-моделей (`WeatherModel`, `TrafficModel`, `TelemetryModel`, `DashboardSnapshot`) | `shared/api/types.ts` |
| `src/store/useDashboardStore.ts` | Единый Zustand-стор: `weather`, `traffic`, `telemetry`, `calendar`, `connectionStatus`, `isConnected`, `activeScreenIndex` + экшены `setWeather/setTraffic/setTelemetry/applySnapshot/setConnectionStatus`, навигация `setScreen/nextScreen/prevScreen/registerActivity` и таймер автовозврата (30 с) | `shared/store/` + слайсы фич |
| `src/services/signalrConnection.ts` | Singleton `HubConnection`, `HubEvents`, `HubMethods` + `reportTrafficVisible()` / `forceTrafficRefresh()` (вызовы хаба без ожидания, только при связи), `wakeScreen()` / `setSleepMode()` (режим питания: оптимистично в стор, затем ответ сервера), бесконечный реконнект, загрузка snapshot, привязка событий к стору; `startDashboardConnection()` | `shared/api/signalr/` |
| `src/App.tsx` | Корень 1024×600 (без отступа — `p-4` внутри экранов), `ScreenCarousel` с `MainScreen` + `SystemScreen`; вызывает `startDashboardConnection()` в `useEffect` (идемпотентно — безопасно в StrictMode) | `app/App.tsx` |
| `src/theme/useTimeTheme.ts` | Тема по времени суток: класс `theme-morning/day/evening/night` на `<html>` (`Feature_Dashboard.md`, 10.1) | на месте |
| `src/store/useDisplaySettingsStore.ts` | Настройки этого экрана в localStorage: `brightness` (`deskhub.brightness`), `forceLightTheme` (`deskhub.forceLightTheme`), `nightShiftEnabled` (`deskhub.nightShift`) (`Feature_Dashboard.md`, 10.3) | на месте |
| `src/components/BrightnessOverlay.tsx` | Программная яркость 10–100 %: чёрный слой `z-[998]` с `opacity = 1 − яркость` | на месте |
| `src/components/NightShiftOverlay.tsx` | Night Shift: тёплый слой `rgba(255,140,0,0.15)` `z-[997]`, `opacity` 0/1 | на месте |
| `src/components/PowerOverlay.tsx` | Слой `z-[999]` по режиму питания: `dimmed` — `bg-black/50`, `sleep` — чёрный экран, касание → `WakeScreen` (10.2) | на месте |
| `src/components/WidgetBoundary.tsx` | Error boundary вокруг каждого виджета (главный и системный экраны, оба слоя мини-карусели): ошибка рендера показывает в ячейке заглушку «Виджет временно недоступен», остальной дашборд работает; повторная попытка через 30 с | `shared/ui/` |
| `src/components/ScreenCarousel.tsx` | Карусель экранов: CSS `translate3d` + Pointer Events, свайп за пальцем через ref, порог 100 px, индикатор экранов (`Feature_Dashboard.md`, 8.2) | `app/` |
| `src/features/dashboard/MainScreen.tsx` | Главный экран, сетка 12×6 (`gap-3 p-4`): часы (кол. 1–7, стр. 1–3), мини-карусель «пробки ↔ кот» (кол. 1–7, стр. 4–6), погода (кол. 8–12, стр. 1–3), календарь (кол. 8–12, стр. 4–6) | на месте |
| `src/features/dashboard/SystemScreen.tsx` | Системный экран: заголовок «Система» + подсказка, телеметрия с блоком управления экраном (кол. 1–5, стр. 2–6) | на месте |
| `src/features/dashboard/BottomLeftCarousel.tsx` | Вертикальная мини-карусель «Пробки ↔ Кот» в левой нижней ячейке: дефолт по тайм-окну, свайп вверх/вниз, автовозврат 30 с; вертикальные жесты забирает у `ScreenCarousel` (`Feature_Dashboard.md`, 9.1) | на месте |
| `src/features/tamagotchi/` | `TamagotchiWidget.tsx`, `Room.tsx`, `Cat.tsx`, `catStates.ts` (состояния, веса, планирование — чистые функции), `useCatBrain.ts` (цепочка `setTimeout`) — `Feature_Dashboard.md`, 9 | на месте |
| `src/features/traffic/trafficWindow.ts`, `useTrafficWindow.ts` | Окно показа пробок: Пн–Пт 10:00–13:20 | на месте |
| `src/features/calendar/` | `CalendarWidget.tsx` (органайзер в стиле iOS: сетка месяца с цветными точками календарей + повестка сегодня/завтра с цветной полосой) + `calendar.ts` (сетка на `Date`, цвета событий по дням, подписи времени, фаза «идёт сейчас») | на месте |
| `src/features/weather/` | `WeatherWidget.tsx`, `weather.mappers.ts` (температура с U+2212, УФ-шкала, фильтр часов), `weatherIcons.tsx` (ключ иконки → lucide) | на месте |
| `src/features/clock/` | `ClockWidget.tsx`, `AnalogClock.tsx` (rAF + useRef, 60 FPS без ре-рендеров), `DigitalDate.tsx`, `clockMath.ts`, `useClock.ts` (время, выровненное по секунде/минуте; используется и погодой) | на месте |
| `src/features/traffic/` | `TrafficWidget.tsx`, `RouteMap.tsx` (SVG-схема ТТК vs МКАД), `traffic.mappers.ts` (цвета загруженности, формат длительности, самый быстрый маршрут) | на месте |
| `src/features/telemetry/` | `TelemetryWidget.tsx` (карточка) + `DisplayControls.tsx` (слайдер яркости, переключатели «Светлая тема» / «Night Shift», кнопка «В режим сна») + `telemetry.mappers.ts` (пороги, форматирование аптайма) | на месте |

Перенос в целевую структуру — при появлении первых фич-виджетов; одновременно стор разбивается на слайсы (раздел 3.2). Реализовано: бесконечный реконнект, ретраи первого `start()`, snapshot после (пере)подключения, повторная попытка по событию `online`, watchdog — `location.reload()`, если статус не `connected` 10 минут подряд (5.3; таймер ведёт `setStatus()` в `signalrConnection.ts`), защита от устаревших данных — экшены стора и `applySnapshot` отбрасывают данные со временем старше текущего (`updatedAt`, у телеметрии `timestamp`; для пробок — `updatedAt` объекта поездки).

---

## 2. Навигация и роутинг

### 2.1. Решение: карусель экранов без React Router

DeskHub — kiosk: адресной строки нет, история браузера и deep-linking не нужны. Поэтому:

- **React Router не используется.** URL всегда `/`; бэкенд всё равно отдаёт `index.html` на любой путь (`MapFallbackToFile`).
- Экраны — **горизонтальная карусель** (`src/components/ScreenCarousel.tsx`), переключение свайпом. Активный экран — `activeScreenIndex` в сторе.

### 2.2. Модель экранов

```ts
export const SCREEN_COUNT = 2          // 0 — главный (MainScreen), 1 — системный (SystemScreen)
export const MAIN_SCREEN = 0
export const IDLE_RETURN_MS = 30_000

interface NavigationState {
  activeScreenIndex: number
  setScreen: (index: number) => void    // с ограничением 0…SCREEN_COUNT − 1, (пере)запускает таймер автовозврата
  nextScreen: () => void
  prevScreen: () => void
  registerActivity: () => void          // любое касание — сброс таймера
}
```

| Экран | Индекс | Как попасть |
|---|---|---|
| Главный (`MainScreen`) | 0 | Старт; свайп вправо с системного; автовозврат |
| Системный (`SystemScreen`) | 1 | Свайп влево с главного |

Новый экран: добавить компонент в `<ScreenCarousel>` в `App.tsx` и увеличить `SCREEN_COUNT`.

### 2.3. Правила

- **Автовозврат:** любой экран, кроме главного, возвращается на него через **30 с без касаний**. Таймер в модуле стора, сбрасывается `registerActivity()` из `onPointerDownCapture` корня карусели (`Feature_Dashboard.md`, 8.3).
- **Переход** — только `transform` (CSS-переход 500 мс `ease-kiosk`); во время свайпа трек следует за пальцем через прямую запись в `style.transform` по ref, без ре-рендеров (`Feature_Dashboard.md`, 8.2).
- **Оба экрана смонтированы постоянно** — виджеты не теряют состояние и подписки; неактивный экран `inert` + `aria-hidden`.
- Корень карусели — `touch-action: none` (иначе Chromium отдаст горизонтальный жест браузерному панорамированию и пришлёт `pointercancel`).

## 3. Управление состоянием

### 3.1. Решение: Zustand

| Критерий | Context API | **Zustand** |
|---|---|---|
| Частые обновления (1 Гц телеметрия) | Ре-рендер всех потребителей контекста | Ре-рендер только подписчиков на изменившийся селектор |
| Запись из вне-React кода (SignalR-колбэки) | Требует прокидывания `dispatch` | `useStore.getState().action()` из любого места |
| Бойлерплейт | Провайдеры на каждый домен | Один стор со слайсами |
| Размер | 0 KB | ~1 KB |

**Выбран Zustand.** Context API используется только для статичных зависимостей (например, конфиг сборки), которые не меняются во время работы.

### 3.2. Структура стора

```ts
interface RootState {
  connection: ConnectionSlice;   // статус SignalR, lastConnectedAt, attempts
  ui: UiSlice;                   // активный экран, ночной режим
  weather: WeatherSlice;         // данные виджета погоды
  traffic: TrafficSlice;         // маршруты и задержки
  telemetry: TelemetrySlice;     // текущие метрики + кольцевые буферы истории
}
```

Каждый доменный слайс имеет единый вид:

```ts
interface DataSlice<T> {
  data: T | null;
  updatedAt: string | null;  // ISO, из DTO сервера
  status: 'idle' | 'ready' | 'error';
  apply: (dto: T) => void;   // вызывается из SignalR-биндингов и snapshot-загрузчика
}
```

### 3.3. Правила

- **Всегда читать через селекторы:** `useStore(s => s.weather.data?.current.temperature)`. Запрещено `const state = useStore()`.
- Для селекторов, возвращающих объекты/массивы, — `useShallow`.
- Мутации только через actions слайса; SignalR-биндинги вызывают `useStore.getState().weather.apply(dto)`.
- Высокочастотные данные для Canvas (история телеметрии) можно читать императивно через `useStore.subscribe` внутри `useEffect`, минуя React-рендер.
- Стор **не персистится** (профиль Kiosk пересоздаётся при каждом запуске Chromium); пользовательские настройки хранятся на бэкенде и приходят в snapshot.

---

## 4. UI-кит и сетка 1024×600

### 4.1. Корневой лэйаут

```
┌──────────────────────────────── 1024 px ────────────────────────────────┐
│ padding 16 px (p-4 — внутри каждого экрана карусели)                     │
│ ┌────────────────────────────────────────────────────────────────────┐   │
│ │                         Контентная область                         │   │ 600
│ │                           992 × 568 px                             │   │ px
│ └────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

- Корень (`App.tsx`): `w-[1024px] h-[600px] overflow-hidden bg-black text-white select-none`; отступ `p-4` — у каждого экрана (`MainScreen`, `SystemScreen`), чтобы при свайпе экран уезжал до края дисплея.
- Контентная область: **992×568 px**.

### 4.2. Сетка

- **CSS Grid, 12 колонок × 6 строк**, `gap-4` (16 px).
  - Ширина колонки: `(992 − 11·16) / 12 = 68 px`.
  - Высота строки: `(568 − 5·16) / 6 ≈ 81.3 px`.
  - Ячейки: 7×3 ≈ **572×276**, 5×3 ≈ **404×276** px.
- Виджеты размещаются явным указанием `col-span-*` / `row-span-*` (и при необходимости `col-start-*`). Никакого автопотока, который может «переполнить» экран.
- Конфигурация раскладки — декларативный массив в `features/dashboard/layout.ts` (см. `Feature_Dashboard.md`).

### 4.3. Дизайн-токены (`tailwind.config.js`)

> **Сейчас:** `surface-*` и `fg-*` — не hex, а CSS-переменные темы (`rgb(var(--bg-card) / <alpha-value>)`), значения — в `src/index.css` для каждой темы (`Feature_Dashboard.md`, раздел 10.1). Пример ниже — исходная тёмная палитра (она же `:root` и `.theme-locked`).

```ts
theme: {
  extend: {
    // размеры экрана — классы w-[1024px] h-[600px] в App.tsx
    colors: {
      surface: { 0: '#0B0D10', 1: '#14171C', 2: '#1C2027' },
      fg:      { primary: '#F2F4F7', secondary: '#A0A7B4', muted: '#5C6370' },
      status:  { ok: '#22C55E', warn: '#F59E0B', bad: '#EF4444', critical: '#B91C1C', info: '#38BDF8' },
    },
    fontSize: {
      clock: ['136px', { lineHeight: '1', letterSpacing: '-0.02em' }],
      hero:  ['56px',  { lineHeight: '1' }],
      value: ['32px',  { lineHeight: '1.1' }],
      label: ['14px',  { lineHeight: '1.2', letterSpacing: '0.04em' }],
    },
    borderRadius: { card: '20px' },
    transitionTimingFunction: { kiosk: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  },
}
```

### 4.4. Базовые компоненты (`shared/ui`)

| Компонент | Назначение | Ключевые правила |
|---|---|---|
| `Card` | Контейнер виджета | `rounded-card bg-surface-1 p-4 overflow-hidden`, слоты `title`, `badge`, `children`, `footer` |
| `Stat` | Крупное число + единица + подпись | `tabular-nums`, опциональный тренд |
| `Badge` | Статус-метка (`ok/warn/bad`) | Цвет + текст (не только цвет) |
| `TouchButton` | Кнопка для тача | `min-h-12 min-w-12`, `active:scale-95 transition-transform duration-100` |
| `Pressable` | Обёртка для тапа/долгого нажатия любой области | См. 4.5 |
| `Skeleton` | Заглушка при загрузке | Статичная или пульсирующая `opacity` |
| `StaleOverlay` | Индикация устаревших данных | Приглушение `opacity-60` + иконка часов + «обновлено N мин назад» |
| `WidgetBoundary` | `ErrorBoundary` для виджета | Фолбэк-карточка «Виджет недоступен», не роняет экран |

### 4.5. Обработка тапов

- Использовать **Pointer Events** (`onPointerDown/Up/Cancel`), а не `onClick` + `onTouchStart` вперемешку: единая модель для тача и мыши в DEV.
- Глобально: `touch-action: manipulation` (убирает задержку double-tap-zoom), на Canvas — `touch-action: none`.
- Хук `usePress({ onTap, onLongPress, longPressMs = 600 })`:
  - тап засчитывается, если палец сместился < 10 px и отпущен до `longPressMs`;
  - при смещении > 10 px — жест отменяется (защита от случайных касаний «ладонью»);
  - `onLongPress` срабатывает по таймеру, без ожидания `pointerup`.
- Визуальный фидбек — сразу на `pointerdown` (`active:` или state `pressed`).
- Дебаунс повторных тапов по одной цели — 300 мс.
- `KioskGuards` на корне: `onContextMenu → preventDefault`, отмена `gesturestart`, `dragstart`, `cursor-none` в production.

---

## 5. Интеграция SignalR

### 5.1. Принципы

- **Одно соединение на приложение** — singleton в `shared/api/signalr/connection.ts`. Компоненты **не создают** соединения и **не вызывают** `connection.on` напрямую.
- Поток данных: `Hub → bindings.ts → store.apply() → селекторы → компоненты`.
- Соединение запускается **вне React** (в `main.tsx` или в `useEffect` корневого `App` с защитой от двойного запуска в StrictMode).

### 5.2. Создание соединения

```ts
import { HubConnectionBuilder, LogLevel, HttpTransportType } from '@microsoft/signalr';

export const connection = new HubConnectionBuilder()
  .withUrl('/hubs/dashboard', { transport: HttpTransportType.WebSockets, skipNegotiation: true })
  .withAutomaticReconnect({
    nextRetryDelayInMilliseconds: ({ previousRetryCount }) =>
      Math.min(30_000, 1_000 * 2 ** previousRetryCount) + Math.random() * 1_000, // ∞ попыток
  })
  .withServerTimeout(30_000)
  .withKeepAliveInterval(10_000)
  .configureLogging(import.meta.env.DEV ? LogLevel.Information : LogLevel.Warning)
  .build();
```

- **Только WebSockets** (`skipNegotiation`) — один origin, localhost, фолбэки не нужны.
- `nextRetryDelayInMilliseconds` **никогда не возвращает `null`** → реконнект бесконечный (экспоненциальная задержка 1→2→4…→30 с + джиттер).

### 5.3. Жизненный цикл и реконнект

```
           start()
 [idle] ──────────► [connecting] ──ok──► [connected] ◄──────────┐
                         │                    │                  │
                       fail              onreconnecting      onreconnected
                         │                    ▼                  │
                         │              [reconnecting] ──────────┘
                         ▼                    │ (не бывает при ∞ ретраях,
                 retry с backoff ◄────── onclose   но обрабатываем)
```

```ts
export async function startHub() {
  bindHubEvents(connection);                       // подписки .on — один раз
  connection.onreconnecting(() => setStatus('reconnecting'));
  connection.onreconnected(async () => {
    setStatus('connected');
    await loadSnapshot();                          // закрыть «дыру» в данных
  });
  connection.onclose(() => { setStatus('disconnected'); scheduleStart(); });
  await startWithRetry();                          // первичный старт тоже с backoff
}

async function startWithRetry(attempt = 0) {
  try {
    setStatus('connecting');
    await connection.start();
    setStatus('connected');
    await loadSnapshot();
  } catch {
    setTimeout(() => startWithRetry(attempt + 1), backoff(attempt));
  }
}
```

> Важно: `withAutomaticReconnect` **не** покрывает первый `start()` — его ретраи реализуются вручную (`startWithRetry`).

Дополнительно:
- `window.addEventListener('online', …)` — форсировать попытку подключения при возврате сети.
- **Watchdog:** если статус `disconnected`/`reconnecting` дольше 10 минут — `location.reload()` (последний рубеж восстановления для 24/7-режима).

### 5.4. Биндинги событий

```ts
// shared/api/hubEvents.ts
export const HubEvents = {
  WeatherUpdated:   'WeatherUpdated',
  TrafficUpdated:   'TrafficUpdated',
  TelemetryTick:    'TelemetryTick',
  SettingsChanged:  'SettingsChanged',   // ещё не реализовано на бэкенде
} as const;

// shared/api/signalr/bindings.ts
export function bindHubEvents(c: HubConnection) {
  const s = useStore.getState;
  c.on(HubEvents.WeatherUpdated,  (dto: WeatherDto)   => s().weather.apply(dto));
  c.on(HubEvents.TrafficUpdated,  (dto: TrafficDto)   => s().traffic.apply(dto));
  c.on(HubEvents.TelemetryTick,   (dto: TelemetryDto) => s().telemetry.push(dto));
  c.on(HubEvents.SettingsChanged, (dto: SettingsDto)  => s().ui.applySettings(dto));
}
```

- Каждый обработчик **валидирует** DTO (лёгкая проверка формы или `zod` в DEV) и при ошибке логирует, не роняя приложение.
- Если событие пришло с `updatedAt` старше текущего в сторе — игнорируется (защита от гонки snapshot ↔ push).

### 5.5. Snapshot

- `GET /api/dashboard/snapshot` → `{ weather, traffic, telemetry, settings }`.
- Вызывается: при первом подключении и после каждого `onreconnected`.
- Snapshot применяется через те же `apply()` — единый путь записи данных.

### 5.6. Индикация связи для UI

```ts
type HubStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
const status = useHubStatus(); // селектор connection.status
```

- `connected` — ничего не показываем.
- `reconnecting` > 5 с — маленькая иконка в углу экрана.
- `disconnected` — плашка «Нет связи с сервером», виджеты переходят в режим `StaleOverlay`. Часы продолжают работать.

---

## 6. Обработка ошибок и надёжность

- `ErrorBoundary` (`WidgetBoundary`) вокруг **каждого** виджета + глобальный вокруг `AppShell` (фолбэк — часы + сообщение, авто-`reload` через 60 с).
- `window.onerror` / `unhandledrejection` → `logger` (в будущем — отправка на бэкенд через хаб).
- Тест долговременной работы: 24 ч на реальном Pi, контроль heap и FPS.

---

## 7. Сборка и интеграция с бэкендом

- `vite.config.ts`:
  - `build.outDir` → `../DeskHub.Api/wwwroot` (`emptyOutDir: true`); тот же путь используется в Docker stage 1;
  - `server.proxy`: `/api` и `/hubs` (с `ws: true`) → `http://localhost:5000` для локальной разработки;
  - `build.target: 'chrome120'` — только современный Chromium, без лишних полифиллов.
- Хэшированные имена ассетов; `index.html` отдаётся бэкендом с `Cache-Control: no-cache`, чтобы после обновления контейнера киоск подхватил новую версию.
- **Автообновление фронтенда после деплоя.** Бэкенд при старте генерирует `InstanceId` (`Guid`, поле `DashboardState`), он отдаётся в `GET /api/dashboard/snapshot`. Клиент запоминает id из первого снимка (`instanceId` в сторе). Снимок запрашивается при первом подключении и после **каждого** переподключения SignalR; если в нём другой `instanceId` — бэкенд перезапущен (деплой), и `applySnapshot` вместо применения данных вызывает `window.location.reload()`. `index.html` отдаётся с `no-cache`, ассеты — с хэшами в именах, поэтому перезагрузка гарантированно подтягивает новую сборку. Обрыв сети с тем же сервером — id совпадает, перезагрузки нет. Проверено: обрыв WebSocket при живом сервере → переподключение без перезагрузки; перезапуск API → страница перезагрузилась через 2.5 с («backend restarted (0898b73a → f538c7ef)»).
