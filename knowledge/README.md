# DeskHub — база знаний (Master Index)

> **Для AI-ассистентов и разработчиков:** это точка входа. Прочитайте этот файл целиком, затем откройте файлы того слоя, с которым связана задача. Если задача затрагивает несколько слоёв (например, новое SignalR-событие), читайте документацию **всех** затронутых слоёв.

---

## 1. Что такое DeskHub

**DeskHub** — персональная настольная инфо-станция (Kiosk-терминал) на **Raspberry Pi 5 (8 GB, ARM64)** с **сенсорным экраном 1024×600 @ 60 Гц** (10.1" 1280×800 пробовали 08.10.2026 и вернулись — на этом дисплее масштаб 1024×600 смотрится лучше). Устройство работает 24/7 и показывает на одном экране:

- **Часы и дату** — крупно, читается с расстояния;
- **Погоду** — текущую и почасовой прогноз (wttr.in);
- **Пробки** — время в пути по маршрутам «Дом → Работа» и обратно;
- **Телеметрию** самого Raspberry Pi — CPU, RAM, температуру SoC, аптайм;
- **Календарь** — сетку месяца и повестку на сегодня/завтра из нескольких календарей (iCloud, Outlook; .ics) с цветами как в iOS.

Взаимодействие — только тач. UI просматривается «с одного взгляда» и не требует действий пользователя.

---

## 2. Верхнеуровневая архитектура

```
┌─────────────────────────── Raspberry Pi 5 · Raspberry Pi OS (Bookworm, 64-bit) ─────────────────────────────┐
│                                                                                                             │
│   Chromium --kiosk --app=http://localhost:5000 (профиль в /dev/shm)                                         │
│        │  HTTP (static, REST)          ▲  WebSocket (SignalR push)                                          │
│        ▼                               │                                                                    │
│   ┌──────────────── Docker: deskhub-api (linux/arm64) ──────────────────┐     ┌ Docker: deskhub-postgres ┐  │
│   │ ASP.NET Core (.NET 10 LTS)                                          │     │ PostgreSQL               │  │
│   │  • wwwroot/  ← React-билд (Vite)  → UseStaticFiles + SPA fallback   │ EF  │  • weather_logs          │  │
│   │  • /api/*    ← REST (snapshot, команды, /health)                    │ Core│  • traffic_logs          │  │
│   │  • /hubs/dashboard ← SignalR Hub                                    ├────►│  • routes, settings      │  │
│   │  • BackgroundServices: Weather · Traffic · Telemetry · Retention    │     └──────────────────────────┘  │
│   └───────────────┬──────────────────────────────────┬──────────────────┘                                   │
│                   │ /proc, /sys (read-only)          │ HTTPS (outbound)                                     │
│                   ▼                                  ▼                                                      │
│              Хост Linux                   wttr.in · Яндекс Карты    · iCloud/Outlook                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Принцип | Суть |
|---|---|
| **Один origin** | React-SPA раздаётся тем же процессом ASP.NET Core, что и API/SignalR. Нет CORS и отдельного веб-сервера. |
| **Push, не poll** | Live-данные идут от бэкенда к клиенту через **SignalR** (`/hubs/dashboard`). Клиентский поллинг запрещён. REST — только для начального снимка (`GET /api/dashboard/snapshot`) и команд. |
| **Внешние API — только бэкенд** | wttr.in (погода), Яндекс Карты и календари опрашивают фоновые сервисы бэкенда. Браузер во внешний интернет не ходит. |
| **Хранение** | PostgreSQL через EF Core (Code-First): история погоды и пробок, маршруты, настройки. Телеметрия живёт в памяти. |
| **Доставка** | Один multi-stage `Dockerfile` (Vite build → `wwwroot` → `dotnet publish`) под **`linux/arm64`**, запуск через `docker compose` (API + PostgreSQL). |
| **Без состояния в браузере** | Профиль Chromium живёт в RAM (`/dev/shm`) и пересоздаётся при каждом запуске браузера (`kiosk.sh`), поэтому всё, что должно сохраняться, хранится на бэкенде; `localStorage` — только для удобств этого экрана (яркость), переживает перезагрузку страницы, но не перезапуск Chromium. |

### Контракт между слоями (кратко)

| SignalR-событие | Источник (бэкенд) | Потребитель (фронтенд) | Частота |
|---|---|---|---|
| `WeatherUpdated` | `WeatherWorker` | `weatherSlice.apply` | 10–15 мин |
| `TrafficUpdated` | `TrafficWorker` | `trafficSlice.apply` | 2–5 мин |
| `TelemetryTick` | `TelemetryWorker` | `setTelemetry` | 1–2 с |
| `CalendarUpdated` | `CalendarWorker` | `setCalendar` | 15 мин |
| `PowerModeChanged` | `PowerModeService` | `setPowerMode` | при смене режима (00:00, 01:30, 08:00, пробуждение) |

Клиент → сервер (методы хаба): `ReportTrafficVisible` (пинг раз в 90 с, пока виден виджет пробок) и `ForceTrafficRefresh` (данные старше 15 мин) — «спящий режим» `TrafficWorker`; `WakeScreen` — касание чёрного экрана, `SetSleepMode` — кнопка «В режим сна» (режим питания).
| `SettingsChanged` | API настроек | `ui.applySettings` | по событию |

Любое изменение контракта (DTO, имя события, эндпоинт) **обязательно** отражается в документации обоих слоёв: `Frontend_react/Feature_Widgets.md` и `Backend_dotnet/Core_Architecture.md`.

---

## 3. Оглавление базы знаний

```
knowledge/
├── README.md                              ← вы здесь: обзор проекта и оглавление
│
├── Frontend_react/                        ← клиент: React + Vite + TS + Tailwind + Canvas
│   ├── 00_Frontend_Architecture.md        суть проекта, железо, флаги Kiosk, модули, глоссарий
│   ├── 01_Frontend_TechStack.md           жёсткие правила: 1024×600, no-scroll, 60 FPS, SignalR-only
│   ├── Core.md                            структура SPA, Zustand, UI-кит, тач, SignalR-клиент
│   ├── Feature_Dashboard.md               главный экран, часы, сетка 12×6, анимации, ночной режим
│   └── Feature_Widgets.md                 виджеты Погода / Пробки / Телеметрия, DTO, Canvas-графики
│
├── Backend_dotnet/                        ← сервер: ASP.NET Core (.NET 10 LTS), SignalR, EF Core
│   ├── Core_Architecture.md               структура решения, pipeline middleware, статика + SPA fallback, Hub, DI
│   ├── Database_EFCore.md                 PostgreSQL, Code-First модели, миграции, ретеншн
│   └── Background_Workers.md              Weather / Traffic / Telemetry / Retention воркеры
│
└── Infrastructure/                        ← доставка и запуск на устройстве
    ├── Docker_Setup.md                    multi-stage Dockerfile под linux/arm64
    ├── Compose_And_Pi.md                  docker-compose (API + PostgreSQL), запуск Chromium Kiosk на Pi
    └── Hardware_Display_Power.md          HDMI off/on на хосте: deploy/pi/display_manager.py, evdev, systemd
```

| Папка | Когда читать |
|---|---|
| **`Frontend_react/`** | Любая работа с UI: вёрстка, компоненты, анимации, стор, клиент SignalR, отображение данных виджетов. |
| **`Backend_dotnet/`** | API-эндпоинты, SignalR Hub, модели и миграции БД, интеграции с wttr.in (погода) / API карт, сбор телеметрии. |
| **`Infrastructure/`** | Сборка образов, `docker-compose`, переменные окружения, деплой на Raspberry Pi, автозапуск Chromium. |

### Рекомендуемый порядок чтения для новой задачи

1. `README.md` (этот файл).
2. Для фронтенда: `Frontend_react/01_Frontend_TechStack.md` → `Core.md` → нужный `Feature_*.md`.
3. Для бэкенда: `Backend_dotnet/Core_Architecture.md` → нужный профильный файл.
4. Для деплоя: `Infrastructure/Docker_Setup.md` → `Compose_And_Pi.md` → `Hardware_Display_Power.md` (демон питания дисплея на хосте).

---

## 4. Правила ведения базы знаний

- **Документация обновляется в том же коммите/PR, что и код**, если меняется архитектура, контракт или правило.
- Один файл — одна тема. Новые фичи оформляются отдельными файлами `Feature_<Name>.md` в своём слое и добавляются в оглавление выше.
- Решения фиксируются вместе с причиной («выбрано X, потому что Y»), чтобы их не пересматривали без нового повода.
- Код в документации — это **эскизы**, иллюстрирующие подход. Если код и документация расходятся, источник правды — код, а документацию нужно исправить.
- Язык документации — русский; идентификаторы, имена событий и пути — на английском, как в коде.
