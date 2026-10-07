# Feature: Widgets (Погода, Пробки, Телеметрия)

> **Назначение документа:** логика получения, хранения и отображения данных виджетов DeskHub.
> Каркас (стор, SignalR, UI-кит) — в [`Core.md`](Core.md). Размещение на экране — в [`Feature_Dashboard.md`](Feature_Dashboard.md).

---

## 0. Общий контракт виджета

Каждый виджет — отдельная фича в `src/features/<name>/` со стандартной структурой:

```
features/<name>/
├── <Name>Widget.tsx        # карточка для дашборда (компактный вид)
├── <Name>Details.tsx       # развёрнутый вид для экрана details (опционально)
├── <name>Slice.ts          # Zustand-слайс: data, updatedAt, status, apply()
├── <name>.mappers.ts       # DTO → view-model, чистые функции (+ тесты)
├── <name>.types.ts         # view-model типы
└── components/             # внутренние компоненты виджета
```

### Общие правила

| Правило | Описание |
|---|---|
| **Источник данных** | Только стор. Виджет не делает `fetch` и не трогает `connection`. |
| **Snapshot + push** | Начальные данные — из `GET /api/dashboard/snapshot`, далее — push-события SignalR. Поллинга нет. |
| **View-model** | Компонент получает уже подготовленные данные (строки, цвета статусов, массивы точек) из мапперов. Никакой бизнес-логики в JSX. |
| **Свежесть** | Для каждого виджета задан порог устаревания (`staleAfter`). При превышении — `StaleOverlay` + «обновлено N мин назад». |
| **Состояния** | Обязательно: `loading` (скелетон), `ready`, `stale`, `error` / `empty`. |
| **Размер** | Контент обязан помещаться в отведённую ячейку сетки без скролла. |
| **Изоляция** | Обёрнут в `WidgetBoundary`, обёрнут в `React.memo`. |
| **Тап** | Тап по карточке → экран `details` для этого виджета. |

Размеры ячеек при текущей раскладке (контент карточки = ячейка − паддинги `p-4`):

| Виджет | Сетка | Размер ячейки | Полезная область |
|---|---|---|---|
| Погода | 5×3 | ~410 × 278 px | ~378 × 246 px |
| Пробки | 7×3 | ~574 × 278 px | ~542 × 246 px |
| Телеметрия | 5×3 | ~410 × 278 px | ~378 × 246 px |

---

## 1. Погода (Weather)

### 1.1. Поток данных

```
Open-Meteo API ──(HTTP, каждые 10–15 мин)──► Backend WeatherService
                                                 │ кэш в PostgreSQL
                                                 ▼
                                   SignalR: WeatherUpdated(WeatherDto)
                                                 │
REST snapshot (старт / реконнект) ──────────────►│
                                                 ▼
                                        weatherSlice.apply()
                                                 ▼
                                   WeatherWidget (селекторы)
```

- **Клиент никогда не обращается к Open-Meteo напрямую.** Координаты, единицы и таймзона настраиваются на бэкенде.
- Основной канал — **SignalR-событие `WeatherUpdated`**. REST используется только в составе snapshot.
- Бэкенд пушит событие только при фактическом изменении данных или по расписанию обновления.

### 1.2. DTO

```ts
export interface WeatherDto {
  updatedAt: string;               // ISO UTC — когда бэкенд получил данные
  location: { name: string };      // «Москва»
  current: {
    temperature: number;           // °C
    apparentTemperature: number;   // °C, «ощущается как»
    weatherCode: number;           // WMO code (Open-Meteo)
    isDay: boolean;
    precipitation: number;         // мм за последний час
    precipitationProbability: number; // %, ближайший час
    windSpeed: number;             // м/с
    uvIndex: number;               // 0–11+
  };
  hourly: Array<{
    time: string;                  // ISO
    temperature: number;
    weatherCode: number;
    precipitationProbability: number;
    uvIndex: number;
  }>;                              // ближайшие 24 ч
  daily?: { sunrise: string; sunset: string; tempMin: number; tempMax: number };
}
```

### 1.3. Отображение (компактная карточка)

```
┌────────────────────────────────────────┐
│ Москва                     ☁ Облачно    │
│                                         │
│   +12°        ощущается +9°             │
│               💧 40%  0.2 мм            │
│               УФ 3 • Умеренный          │
│                                         │
│  15   16   17   18   19   20            │
│  ☁    🌦   🌧   🌧   ☁   🌙             │
│  12°  11°  10°  9°   9°   8°            │
└────────────────────────────────────────┘
```

| Элемент | Правила |
|---|---|
| **Текущая температура** | `text-hero tabular-nums`, округление до целого, знак `+`/`−` (настоящий минус `−` U+2212). |
| **Иконка погоды** | Маппинг WMO `weatherCode` + `isDay` → иконка + текстовое описание (`weatherCode.ts`, таблица на все коды WMO). Иконки — inline SVG / lucide. |
| **Осадки** | Вероятность (%) ближайшего часа + количество (мм). Если вероятность < 10% и 0 мм — блок скрывается. |
| **УФ-индекс** | Значение + категория с цветом (см. таблицу ниже). Ночью (`isDay = false`) — не отображается. |
| **Почасовой прогноз** | 6 ближайших часов в компактной карточке, 24 часа в `details`. Начинается со следующего полного часа. Час — `HH`, иконка, температура. |

**Шкала УФ-индекса (ВОЗ):**

| УФ | Категория | Цвет |
|---|---|---|
| 0–2 | Низкий | `status-ok` |
| 3–5 | Умеренный | жёлтый |
| 6–7 | Высокий | `status-warn` |
| 8–10 | Очень высокий | `status-bad` |
| 11+ | Экстремальный | фиолетовый |

### 1.4. Детальный экран

- Почасовой прогноз на 24 ч: **SVG-кривая температуры** (полилиния по точкам, без библиотек) + столбики вероятности осадков снизу.
- Восход/закат, мин/макс за день.

### 1.5. Свежесть и ошибки

- `staleAfter`: **30 мин** (при обновлении бэкендом раз в 10–15 мин).
- Почасовой прогноз фильтруется по текущему времени на клиенте (`useClock('minute')`), чтобы прошедшие часы исчезали даже без нового push.
- Нет данных (бэкенд не смог получить погоду с момента старта) — карточка «Погода недоступна» с иконкой.

---

## 2. Пробки (Traffic / Route)

### 2.1. Поток данных

```
Routing/Traffic API ──(каждые 2–5 мин; в часы пик чаще)──► Backend TrafficService
                                                            │ история в PostgreSQL
                                                            ▼
                                          SignalR: TrafficUpdated(TrafficDto)
                                                            ▼
                                                  trafficSlice.apply()
```

- Список маршрутов («Дом → Работа», «Работа → Дом», …) хранится на бэкенде.
- Бэкенд рассчитывает «типичное» время в пути (`baselineMinutes`) — без пробок или медиана по истории — и уровень загруженности. **Фронтенд не вычисляет уровень сам**, а только отображает его (единый источник правды); маппер на фронте содержит лишь фолбэк-расчёт, если поле не пришло.

### 2.2. DTO

```ts
export type CongestionLevel = 'free' | 'moderate' | 'heavy' | 'severe';

export interface RouteDto {
  id: string;
  name: string;                 // «Дом → Работа»
  durationMinutes: number;      // текущее время в пути с учётом пробок
  baselineMinutes: number;      // типичное время без пробок
  distanceKm: number;
  congestion: CongestionLevel;
  trend?: 'up' | 'down' | 'flat'; // изменение относительно предыдущего замера
  eta?: string;                 // ISO — ожидаемое время прибытия при выезде сейчас
  incidents?: Array<{ title: string; severity: 'minor' | 'major' }>;
}

export interface TrafficDto {
  updatedAt: string;
  routes: RouteDto[];
}
```

### 2.3. Цветовая индикация загруженности

Уровень определяется отношением задержки к базовому времени: `ratio = durationMinutes / baselineMinutes`.

| Уровень | Условие (фолбэк на клиенте) | Цвет | Текст |
|---|---|---|---|
| `free` | ratio < 1.15 | `status-ok` (зелёный) | «Свободно» |
| `moderate` | 1.15 ≤ ratio < 1.4 | `status-warn` (жёлтый/янтарный) | «Затруднено» |
| `heavy` | 1.4 ≤ ratio < 1.8 | `status-bad` (красный) | «Пробки» |
| `severe` | ratio ≥ 1.8 | `status-critical` (тёмно-красный) | «Сильные пробки» |

> Цвет **никогда не единственный носитель информации**: всегда дублируется текстом и/или иконкой.

### 2.4. Отображение

```
┌───────────────────────────────────────────────────────────┐
│ ДОРОГИ                                                     │
│                                                            │
│  Дом → Работа                      ● Пробки                │
│  32 мин   +8 мин   ▲               прибытие 15:09          │
│  ███████████████████░░░░░  (полоса: 24 базовых + 8 задержки)│
│                                                            │
│  Работа → Дом                      ● Свободно              │
│  25 мин   ±0                                              │
│  ████████████████████████                                  │
└───────────────────────────────────────────────────────────┘
```

| Элемент | Правила |
|---|---|
| **Название маршрута** | `text-label uppercase text-fg-secondary`, truncate. |
| **Время в пути** | `text-value tabular-nums`; ≥ 60 мин → «1 ч 12 мин». |
| **Задержка** | `durationMinutes − baselineMinutes`: `+8 мин` цветом уровня; `±0` — приглушённо. |
| **Тренд** | `▲` / `▼` / нет — изменение с прошлого замера (если |Δ| ≥ 2 мин). |
| **Полоса загруженности** | Tailwind-бар: базовая часть нейтральная, задержка — цветом уровня. Ширина задаётся `transform: scaleX()` от левого края (`origin-left`), анимируется `transition-transform`. |
| **ETA** | «прибытие 15:09» — пересчитывается на клиенте по `useClock('minute')` + `durationMinutes`, если `eta` не пришёл. |
| **Инциденты** | Иконка ⚠ + первый инцидент одной строкой (truncate) — только в `details`. |

- В карточку помещается **до 2 маршрутов**. Остальные — на экране `details`. Порядок задаётся бэкендом (можно приоритизировать маршрут по времени суток: утром «Дом → Работа» первым).

### 2.5. Свежесть

- `staleAfter`: **10 мин**. Устаревшее время в пути вводит в заблуждение, поэтому при `stale` значения приглушаются, а статус-цвет заменяется на нейтральный серый.

---

## 3. Телеметрия Raspberry Pi (Telemetry)

### 3.1. Поток данных

```
/proc/stat, /proc/meminfo, /sys/class/thermal/thermal_zone0/temp, /proc/uptime
                       │ (бэкенд читает каждые 1–2 с)
                       ▼
           Backend TelemetryService ──► SignalR: TelemetryTick(TelemetryDto)
                                                       ▼
                                        telemetrySlice.push(dto)
                                         ├─ current (для чисел)
                                         └─ ring buffers (для графиков)
```

- Самое частое событие в системе (~1 Гц) — требует наибольшей аккуратности с ре-рендерами.
- В snapshot бэкенд отдаёт **историю** последних N точек (например, 120), чтобы графики не начинались с нуля после перезагрузки страницы/реконнекта.

### 3.2. DTO

> **Текущая реализация** (`src/types/dashboard.ts` ↔ `Models/TelemetryModel.cs`): `TelemetryModel { cpuPercent, ramUsedMb, ramTotalMb, temperatureC: number | null, uptimeSeconds, timestamp }`, событие `TelemetryTick`. История в snapshot, `cpuPerCore`, `throttled`, `cpuFreqMhz` — следующий этап (вместе со спарклайнами). Виджет сейчас: CPU и RAM — число + Tailwind-бар (`scaleX`), температура — число с цветом по порогам, аптайм в заголовке, приглушение + «нет связи» при потере соединения.

```ts
export interface TelemetryDto {
  timestamp: string;          // ISO
  cpuPercent: number;         // 0–100, общая загрузка
  cpuPerCore?: number[];      // 4 ядра (Cortex-A76)
  memUsedMb: number;
  memTotalMb: number;         // ~8 GB
  socTempC: number;           // температура SoC
  uptimeSeconds: number;
  throttled?: boolean;        // флаг троттлинга (vcgencmd get_throttled)
  cpuFreqMhz?: number;
}

export interface TelemetrySnapshotDto {
  current: TelemetryDto;
  history: TelemetryDto[];    // последние N точек
}
```

### 3.3. Хранение истории: кольцевой буфер

```ts
// shared/lib/ringBuffer.ts
export class RingBuffer {
  private buf: Float32Array;
  private head = 0;
  private size = 0;
  constructor(readonly capacity: number) { this.buf = new Float32Array(capacity); }
  push(v: number) { this.buf[this.head] = v; this.head = (this.head + 1) % this.capacity; this.size = Math.min(this.size + 1, this.capacity); }
  forEach(fn: (v: number, i: number) => void) { /* от старых к новым */ }
  get length() { return this.size; }
}
```

- Буферы: `cpu`, `mem`, `temp` — по **120 точек** (≈ 2 мин при 1 Гц). Для `details` — до 600 точек (10 мин).
- `Float32Array` — фиксированная память, отсутствие аллокаций на тик → нет нагрузки на GC при работе 24/7.
- Буферы живут **в сторе** (вне компонента), поэтому переход между экранами не теряет историю.
- `push()` в слайсе мутирует буфер и инкрементирует счётчик `version` — компоненты подписываются на `version`/текущие значения, а не на сам буфер.

### 3.4. Отображение

```
┌────────────────────────────────────────┐
│ СИСТЕМА                    ⏱ 12д 4ч    │
│                                         │
│ CPU   23%  ▁▂▂▃▅▃▂▁▁▂▃▂▁▁▂▂▃▄▃▂        │
│ RAM   2.1 / 7.9 GB  ████████░░░░░░ 27% │
│ T°    54°C ▁▁▂▂▂▃▃▃▃▃▄▄▄▃▃▃▃▃▃▃        │
│                                         │
│ ● Норма          2400 MHz               │
└────────────────────────────────────────┘
```

| Метрика | Визуализация | Почему |
|---|---|---|
| **CPU %** | Число + **Canvas-спарклайн** (история 120 точек) | Быстро меняется — важна динамика |
| **RAM** | Число `used / total GB` + **Tailwind-бар** (`scaleX`) + % | Меняется медленно — достаточно текущего значения |
| **Температура SoC** | Число + **Canvas-спарклайн** + цвет по порогам | Важен тренд нагрева |
| **Аптайм** | Текст `12д 4ч` / `3ч 15м` | Только значение; приходит в каждом тике, локальный отсчёт не нужен |
| **Троттлинг** | Badge «Троттлинг!» `status-bad` | Показывается только при `throttled = true` |

**Пороги температуры SoC (Raspberry Pi 5):**

| Температура | Статус | Цвет |
|---|---|---|
| < 60 °C | Норма | `status-ok` |
| 60–80 °C | Тепло | `status-warn` |
| ≥ 80 °C | Перегрев (близко к троттлингу) | `status-bad` |
| `null` | Датчик недоступен | `text-fg-muted`, значение «—» |

**Пороги CPU / RAM:** < 70% — норма, 70–90% — `warn`, > 90% — `bad`.

### 3.5. Рендеринг графиков: Canvas vs SVG vs Tailwind

| Подход | Где применять |
|---|---|
| **Canvas 2D** | Спарклайны CPU и температуры, частые обновления (1 Гц), детальные графики в `details` |
| **SVG** | Статичные/редко меняющиеся графики (почасовой прогноз погоды) |
| **Tailwind-бары** | Одиночные значения с прогрессом (RAM, полоса пробок) |

**Компонент `Sparkline` (Canvas):**

```tsx
// shared/ui/Sparkline.tsx — эскиз
export const Sparkline = memo(function Sparkline({ selectBuffer, min, max, colorFor }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current!.getContext('2d', { alpha: false })!;
    let rafId = 0;

    const draw = () => {
      rafId = 0;
      const buf = selectBuffer(useStore.getState());
      // clear → path по точкам буфера → stroke; опционально fill градиентом (градиент кэшируется)
    };

    // Рисуем только при поступлении новых данных, а не каждый кадр
    const unsub = useStore.subscribe(s => s.telemetry.version, () => {
      if (!rafId) rafId = requestAnimationFrame(draw);
    });
    draw();
    return () => { unsub(); cancelAnimationFrame(rafId); };
  }, [selectBuffer]);

  return <canvas ref={canvasRef} width={W} height={H} className="block touch-none" />;
});
```

Правила Canvas:
- **Перерисовка по событию данных**, коалесцированная в один `requestAnimationFrame`. Никакого бесконечного rAF-цикла «на всякий случай».
- React **не ре-рендерит** компонент на тик: подписка на стор через `useStore.subscribe`, рисование — императивно.
- Размер canvas задаётся атрибутами `width/height` в пикселях (DPR = 1 на целевом экране; в DEV можно учитывать `devicePixelRatio`).
- `getContext('2d', { alpha: false })` + заливка фона цветом карточки — быстрее композитинг.
- Градиенты, шрифты, цвета — создаются один раз, не на каждый кадр.
- Шкала Y фиксирована (CPU 0–100, температура 30–90 °C), чтобы график не «дышал» при автомасштабе.
- Опционально: плавный «сдвиг» графика между тиками через rAF-интерполяцию — только если укладывается в бюджет кадра на Pi.

**Числовые значения** (`23%`, `54°C`) — обычные React-компоненты с узкими селекторами (`useStore(s => s.telemetry.current?.cpuPercent)`) и `tabular-nums`. Значения округляются до целого перед селектором, чтобы не было ре-рендера на изменение в десятых долях.

### 3.6. Свежесть

- `staleAfter`: **10 с**. Если тики перестали приходить — значения приглушаются, на спарклайнах появляется пунктирный разрыв, бейдж «нет данных».

---

## 4. Сводная таблица событий SignalR

| Событие | Payload | Частота (ориентир) | Слайс | `staleAfter` |
|---|---|---|---|---|
| `WeatherUpdated` | `WeatherDto` | 10–15 мин | `weather.apply` | 30 мин |
| `TrafficUpdated` | `TrafficDto` | 2–5 мин | `traffic.apply` | 10 мин |
| `TelemetryTick` | `TelemetryDto` | 1–2 с | `telemetry.push` | 10 с |
| `SettingsChanged` | `SettingsDto` | по событию | `ui.applySettings` | — |

Snapshot (`GET /api/dashboard/snapshot`): `{ weather: WeatherDto | null, traffic: TrafficDto | null, telemetry: TelemetrySnapshotDto | null, settings: SettingsDto, serverTime: string }`.

---

## 5. Тестирование виджетов

- **Мапперы** (`*.mappers.ts`): WMO-коды → иконка/текст, категории УФ, уровни пробок по ratio, форматирование длительности («1 ч 12 мин»), аптайма («12д 4ч»), пороги температуры.
- **Слайсы:** `apply()` игнорирует данные со старым `updatedAt`; `push()` корректно заполняет кольцевой буфер при переполнении.
- **Компоненты:** рендер всех состояний (`loading` / `ready` / `stale` / `error`) с фикстурами DTO в вьюпорте ячейки.
- **Mock-хаб для разработки:** DEV-режим с генератором фейковых событий (`VITE_MOCK_HUB=true`), чтобы разрабатывать фронт без бэкенда.
- **Производительность:** на реальном Pi при 1 Гц телеметрии — CPU вкладки Chromium < 15%, отсутствие long tasks > 50 мс.
