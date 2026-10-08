# Docker Compose и запуск на Raspberry Pi

> **Назначение документа:** как DeskHub разворачивается и запускается на Raspberry Pi 5: `docker-compose.yml` (API + PostgreSQL), переменные окружения, вольюмы, а также автозапуск Chromium в режиме Kiosk, который дожидается готовности контейнера.
> Сборка образа — [`Docker_Setup.md`](Docker_Setup.md). Флаги Chromium с точки зрения фронтенда — [`../Frontend_react/00_Frontend_Architecture.md`](../Frontend_react/00_Frontend_Architecture.md).

---

## 1. Последовательность загрузки устройства

```
 Питание
   │
   ▼
 Raspberry Pi OS (Bookworm, 64-bit) ── systemd
   │
   ├──► docker.service (enabled) ──► compose-проект (restart: unless-stopped)
   │        ├─ postgres (deskhub-postgres) ── healthcheck: pg_isready
   │        └─ api (deskhub-api)           ── depends_on postgres (healthy) → миграции → /health = 200
   │
   └──► автологин пользователя → композитор labwc (Wayland)
            └─ ~/.config/labwc/autostart → kiosk.sh
                   ├─ ждёт http://localhost:5000/health = 200 (до N минут)
                   └─ запускает Chromium --kiosk … (и перезапускает при падении)
```

Ключевая идея: **контейнеры и браузер стартуют независимо**, а синхронизирует их `kiosk.sh`, опрашивая `/health`. Пока API не готов, на экране — чёрный фон (или заставка), а не страница ошибки Chromium.

---

## 2. `docker-compose.yml`

```yaml
# Подробности: knowledge/Infrastructure/Compose_And_Pi.md
name: deskhub

services:
  api:
    # build — локальная сборка (docker compose build); image — имя в Docker Hub:
    # на Mac образ собирается и пушится, на Raspberry Pi deploy.sh делает docker compose pull
    build:
      context: .
      dockerfile: Dockerfile
    image: artembarabash/deskhub:latest
    container_name: deskhub-api
    restart: unless-stopped
    # Массив календарей (Calendar__Sources__N__Url/Color) передаётся из .env целиком — перечислять в environment неудобно
    env_file:
      - path: .env
        required: false
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "127.0.0.1:5000:8080"   # только localhost: Kiosk работает на этом же устройстве
    environment:
      ASPNETCORE_ENVIRONMENT: Production
      TZ: ${TZ:-Europe/Moscow}
      ConnectionStrings__DefaultConnection: ${ConnectionStrings__DefaultConnection:?set in .env}
      OpenMeteo__Latitude: ${OpenMeteo__Latitude:-55.7558}
      OpenMeteo__Longitude: ${OpenMeteo__Longitude:-37.6173}
      OpenMeteo__LocationName: ${OpenMeteo__LocationName:-Москва}
      OpenMeteo__IntervalMinutes: ${OpenMeteo__IntervalMinutes:-15}
      Traffic__Provider: ${Traffic__Provider:-Yandex}   # Yandex | Mock
      Calendar__TimeZone: ${TZ:-Europe/Moscow}
      Telemetry__ProcRoot: /host/proc
      Telemetry__SysRoot: /host/sys
    volumes:
      - /proc:/host/proc:ro     # метрики хоста для TelemetryWorker
      - /sys:/host/sys:ro
    logging: &default-logging
      driver: json-file
      options: { max-size: "10m", max-file: "3" }

  postgres:
    image: postgres:16-bookworm
    container_name: deskhub-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-deskhub}
      POSTGRES_USER: ${POSTGRES_USER:-deskhub}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set in .env}
      TZ: ${TZ:-Europe/Moscow}
    volumes:
      - pgdata:/var/lib/postgresql/data
    # Порт наружу не публикуется — БД доступна только сервису api.
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 20
    logging: *default-logging

volumes:
  pgdata:
```

### 2.1. Пояснения

| Элемент | Решение и причина |
|---|---|
| **Порт `127.0.0.1:5000:8080`** | API слушает `8080` внутри контейнера, на хосте доступен **только с localhost** — Chromium открывает `http://localhost:5000`. Из LAN API недоступен, поэтому аутентификация не нужна (см. `Backend_dotnet/Core_Architecture.md`, 3.2). |
| **БД без `ports`** | PostgreSQL виден только сервису `api` во внутренней сети compose (`Host=postgres`). |
| **Вольюм `pgdata`** | Именованный вольюм Docker → данные переживают пересоздание контейнера и обновление образа. Хранится в `/var/lib/docker/volumes/deskhub_pgdata`. При наличии NVMe SSD каталог Docker (`data-root`) рекомендуется перенести на SSD. |
| **`depends_on: service_healthy`** | `api` стартует после готовности сервиса `postgres`; ретраи миграций в коде — вторая линия защиты. |
| **`env_file: .env` (required: false)** | Сервис `api` получает весь `.env` — так передаётся массив календарей `Calendar__Sources__N__*`, который неудобно перечислять в `environment`. Без `.env` запуск не падает. |
| **`/proc`, `/sys` → `/host/*:ro`** | Явный read-only доступ к метрикам хоста для `TelemetryWorker`. Пути передаются через `Telemetry__ProcRoot/SysRoot`. |
| **`TZ`** | Совпадает с таймзоной хоста — часы пик, ночной режим и retention считаются в локальном времени. |
| **`restart: unless-stopped`** | Автоподъём после перезагрузки Pi и падений; не поднимает контейнер, остановленный вручную. |
| **`logging` с ротацией** | Логи не забивают SD-карту (максимум 30 MB на сервис). |
| **Троттлинг (опционально)** | Для `vcgencmd get_throttled` добавить сервису `api`: `devices: ["/dev/vcio:/dev/vcio"]` (см. `Backend_dotnet/Background_Workers.md`, 5.1). |

### 2.2. `.env` (на устройстве, не в git)

```dotenv
# Скопировать в .env и заполнить. Файл .env в git не коммитится.

TZ=Europe/Moscow

# --- PostgreSQL ---
POSTGRES_DB=deskhub
POSTGRES_USER=deskhub
POSTGRES_PASSWORD=change-me

# Строка подключения API (Host = имя сервиса в docker-compose); пароль должен совпадать с POSTGRES_PASSWORD
ConnectionStrings__DefaultConnection=Host=postgres;Port=5432;Database=deskhub;Username=deskhub;Password=change-me

# --- Open-Meteo (ключ не нужен) ---
OpenMeteo__Latitude=55.7558
OpenMeteo__Longitude=37.6173
OpenMeteo__LocationName=Москва
OpenMeteo__IntervalMinutes=15

# --- Календари (iCloud, Outlook, любой публичный .ics) — массив Calendar__Sources__N__Url / __Color ---
# iCloud: Календарь → «Поделиться» → «Публичный календарь» → webcal://…; Outlook: «Опубликовать календарь» → ссылка .ics.
# Ссылки открывают календари без пароля — НЕ КОММИТИТЬ: реальные значения только в .env (он в .gitignore).
# Цвета — палитра iOS. Пустой список — календарь не подключён.
Calendar__Sources__0__Url=webcal://pXX-caldav.icloud.com/published/2/<токен-личного>
Calendar__Sources__0__Color=#34C759
Calendar__Sources__1__Url=webcal://pXX-caldav.icloud.com/published/2/<токен-семейного>
Calendar__Sources__1__Color=#007AFF
Calendar__Sources__2__Url=webcal://pXX-caldav.icloud.com/published/2/<токен-третьего>
Calendar__Sources__2__Color=#AF52DE
Calendar__Sources__3__Url=https://outlook.office365.com/owa/calendar/<id>/<токен>/reachcalendar.ics
Calendar__Sources__3__Color=#FF9500

# --- Пробки: Yandex (веб-версия Яндекс Карт, ключ не нужен) | Mock (генератор для разработки) ---
Traffic__Provider=Yandex
```

Права: `chmod 600 .env`. Синтаксис `${VAR:?…}` прерывает запуск compose, если обязательная переменная не задана.

> Пароль задаётся дважды — в `POSTGRES_PASSWORD` (инициализация БД) и внутри `ConnectionStrings__DefaultConnection` (подключение API). Значения должны совпадать. `POSTGRES_PASSWORD` применяется только при **первой** инициализации вольюма `pgdata`.

---

## 3. Подготовка Raspberry Pi OS (один раз)

```bash
# 1. Docker Engine + compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
sudo systemctl enable --now docker

# 2. Автологин в рабочий стол (Desktop Autologin) и отключение гашения экрана
sudo raspi-config nonint do_boot_behaviour B4
sudo raspi-config nonint do_blanking 1

# 3. Убедиться, что используется labwc (дефолт Bookworm для Pi 5 с конца 2024)
#    raspi-config → Advanced Options → Wayland → labwc

# 4. Каталог проекта и файлы (копируются с Mac, см. раздел 5.1)
mkdir -p ~/deskhub
#    с Mac: scp docker-compose.yml .env deploy.sh pi@deskhub.local:~/deskhub/
#    плюс kiosk.sh: scp deploy/pi/kiosk.sh pi@deskhub.local:~/deskhub/ (раздел 4)
cd ~/deskhub && chmod +x deploy.sh && chmod 600 .env

# 5. Первый запуск — тем же скриптом, что и обновления
./deploy.sh
curl -fsS http://localhost:5000/health   # → Healthy
```

---

## 4. Kiosk: запуск Chromium

### 4.1. `deploy/pi/kiosk.sh` (в репозитории; на Pi — `~/deskhub/kiosk.sh`)

```bash
#!/usr/bin/env bash
# DeskHub Kiosk launcher: ждёт готовности API и держит Chromium запущенным.
#
# Установка на Raspberry Pi (один раз):
#   scp deploy/pi/kiosk.sh pi@deskhub.local:~/deskhub/
#   chmod +x ~/deskhub/kiosk.sh
#   echo '"$HOME/deskhub/kiosk.sh" &' >> ~/.config/labwc/autostart
# Подробности: knowledge/Infrastructure/Compose_And_Pi.md, раздел 4.
#
# После деплоя новой версии фронтенд перезагружается сам (новый InstanceId бэкенда) — перезапускать Chromium не нужно.
set -u

URL="http://localhost:5000"
HEALTH_URL="$URL/health"
WAIT_TIMEOUT_SEC=300          # сколько ждать API при холодном старте
LOG="$HOME/.cache/deskhub-kiosk.log"

mkdir -p "$(dirname "$LOG")"
log() { echo "$(date '+%F %T') $*" >> "$LOG"; }

# Chromium в Bookworm называется chromium-browser, в более новых сборках — chromium
CHROMIUM="$(command -v chromium-browser || command -v chromium)"
[ -z "$CHROMIUM" ] && { log "Chromium not found"; exit 1; }

wait_for_api() {
  local waited=0
  until curl -fsS --max-time 2 "$HEALTH_URL" > /dev/null 2>&1; do
    if (( waited >= WAIT_TIMEOUT_SEC )); then
      log "API not ready after ${WAIT_TIMEOUT_SEC}s, starting Chromium anyway"
      return 1
    fi
    sleep 2; waited=$((waited + 2))
  done
  log "API ready after ${waited}s"
}

wait_for_api

# Перезапуск Chromium, если он упал или был закрыт
while true; do
  log "Starting Chromium"
  "$CHROMIUM" \
    --kiosk \
    --incognito \
    --app="$URL" \
    --ozone-platform=wayland \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-features=TranslateUI \
    --disable-pinch \
    --overscroll-history-navigation=0 \
    --password-store=basic \
    --no-first-run \
    --check-for-update-interval=31536000 \
    >> "$LOG" 2>&1
  log "Chromium exited with code $?, restarting in 5s"
  sleep 5
  wait_for_api      # если упал вместе с API — снова дождаться готовности
done
```

```bash
scp deploy/pi/kiosk.sh pi@deskhub.local:~/deskhub/   # с Mac
chmod +x ~/deskhub/kiosk.sh                          # на Pi
```

### 4.2. Флаги Chromium

| Флаг | Назначение |
|---|---|
| `--kiosk` | Полный экран без UI браузера, выйти нельзя обычными средствами |
| `--incognito` | Чистый профиль при каждом старте: нет диалога «восстановить вкладки», нет накопления кэша. Следствие — нет persistent `localStorage` (настройки хранятся на бэкенде). |
| `--app=http://localhost:5000` | Открыть приложение как отдельное окно-приложение |
| `--ozone-platform=wayland` | Нативный Wayland-бэкенд под labwc |
| `--noerrdialogs`, `--disable-infobars`, `--disable-session-crashed-bubble` | Никаких всплывающих панелей и диалогов поверх UI |
| `--disable-pinch`, `--overscroll-history-navigation=0` | Запрет зума щипком и свайпа «назад» |
| `--password-store=basic` | Не вызывать диалог разблокировки системного keyring |
| `--no-first-run`, `--check-for-update-interval=…` | Без мастера первого запуска и проверок обновлений |

### 4.3. Почему ожидание `/health`, а не просто задержка

- `sleep 30` перед стартом ненадёжен: холодный старт (первый запуск, миграции, медленная SD-карта) может занять дольше, а при тёплом старте экран зря будет чёрным.
- `/health` возвращает `200` только когда приложение запущено **и** БД доступна → к моменту открытия страницы работают и статика, и snapshot, и SignalR.
- Если API так и не поднялся за `WAIT_TIMEOUT_SEC`, Chromium всё равно запускается: фронтенд при сбое загрузки не сможет восстановиться сам, но цикл `while` и watchdog фронтенда (`location.reload()`, см. `Frontend_react/Core.md`, 5.3) вернут страницу, как только API станет доступен. Для надёжности можно вместо `--app=$URL` открывать локальную заглушку `file://…/waiting.html`, которая сама опрашивает `/health` и делает редирект.

### 4.4. Автозапуск через labwc

```bash
mkdir -p ~/.config/labwc
cat >> ~/.config/labwc/autostart <<'EOF'
"$HOME/deskhub/kiosk.sh" &
EOF
```

- Если `~/.config/labwc/autostart` создаётся впервые — системный `/etc/xdg/labwc/autostart` (панель, обои) перестаёт выполняться. Для киоска это желательно: панель задач не нужна.
- Альтернатива — systemd user unit (`~/.config/systemd/user/deskhub-kiosk.service`, `WantedBy=graphical-session.target`, `Restart=always`). Выбран autostart labwc как более простой вариант; при переходе на systemd этот раздел обновляется.

---

## 5. Эксплуатация

### 5.1. Деплой и обновление: Mac → Docker Hub → Pi

Образ собирается на Mac (Apple Silicon — тоже arm64, сборка нативная, без эмуляции) и публикуется в Docker Hub как **`artembarabash/deskhub:latest`**; на Pi нет исходников — только `docker-compose.yml`, `.env` и `deploy.sh` в `~/deskhub`.

```
Mac                                         Docker Hub                       Raspberry Pi 5
docker build --platform linux/arm64   →    artembarabash/deskhub:latest  →  ~/deskhub/deploy.sh
docker push                                                                  pull → up -d → prune
```

**На Mac** (один раз `docker login`):

```bash
docker build --platform linux/arm64 -t artembarabash/deskhub:latest . && docker push artembarabash/deskhub:latest
```

**В `docker-compose.yml`** у сервиса `api` есть и `build` (локальная сборка `docker compose build` на машине разработчика), и `image: artembarabash/deskhub:latest` — имя в реестре: `docker compose pull` на Pi скачивает его, а `up -d` берёт скачанный образ (собирать без `--build` compose не пытается).

**На Pi — `deploy.sh`** (лежит в корне репозитория, копируется в `~/deskhub`):

```bash
#!/bin/bash
# Переходим в директорию проекта на Raspberry Pi
cd ~/deskhub || exit

echo "Pulling latest images..."
docker compose pull

echo "Starting containers..."
docker compose up -d

echo "Cleaning up old images..."
docker image prune -f

echo "Deploy complete!"
```

| Шаг | Что происходит |
|---|---|
| `docker compose pull` | Скачивает `artembarabash/deskhub:latest` и `postgres:16-bookworm` |
| `docker compose up -d` | Пересоздаёт только контейнеры с изменившимся образом/конфигурацией; миграции БД применяются при старте API; данные — в томе `pgdata` |
| `docker image prune -f` | Удаляет «висячие» старые образы — SD-карта не забивается |

**Первая установка:** раздел 3 (Docker, автологин), затем `mkdir -p ~/deskhub`, скопировать с Mac `docker-compose.yml`, `.env` (заполненный — секреты только здесь) и `deploy.sh` (`scp … pi@deskhub.local:~/deskhub/`), `chmod +x deploy.sh`, `chmod 600 .env`, `./deploy.sh`. **Обновление:** push с Mac → `./deploy.sh` на Pi (или `ssh pi@deskhub.local '~/deskhub/deploy.sh'`). Если изменились `docker-compose.yml` или набор переменных в `.env` — сначала скопировать их на Pi.

Особенности и ограничения:
- **Фронтенд после обновления — автоматически.** Новый контейнер отдаёт новый `InstanceId` в снимке; киоск переподключается к SignalR, видит другой id и сам делает `location.reload()` — через пару секунд на экране новая сборка (`Frontend_react/Core.md`, раздел 7). Перезапускать Chromium не нужно.
- **Откат.** Тег один — `latest`, поэтому откатиться можно только пересборкой нужного коммита. Для быстрого отката стоит дополнительно пушить тег версии (`-t artembarabash/deskhub:$(git rev-parse --short HEAD)`) и при необходимости временно указывать его в `image:`. Если в новой версии были миграции — сначала восстановить бэкап БД (5.2).
- **Видимость образа.** Репозиторий Docker Hub по умолчанию публичный. Секретов в образе нет (`.env` в `.dockerignore`, ссылки календарей и пароли — только в рантайме), но код приложения виден. Приватный репозиторий — в настройках Docker Hub, тогда на Pi нужен `docker login`.
- На Pi **не** запускать `docker compose build` / `up --build` — исходников там нет.

### 5.2. Бэкап PostgreSQL

```bash
# crontab -e  (ежедневно в 04:00, хранить 14 дней)
0 4 * * * cd ~/deskhub && docker compose exec -T postgres pg_dump -U deskhub -Fc deskhub > /mnt/backup/deskhub-$(date +\%F).dump && find /mnt/backup -name 'deskhub-*.dump' -mtime +14 -delete
```

Восстановление:

```bash
docker compose exec -T postgres pg_restore -U deskhub -d deskhub --clean < /mnt/backup/deskhub-YYYY-MM-DD.dump
```

### 5.3. Диагностика

| Задача | Команда |
|---|---|
| Состояние контейнеров | `docker compose ps` |
| Логи API | `docker compose logs -f --tail=200 api` |
| Проверка API | `curl -fsS http://localhost:5000/health` |
| Логи kiosk-скрипта | `tail -f ~/.cache/deskhub-kiosk.log` |
| Перезапуск браузера | `pkill -f chromium` (скрипт поднимет его заново через 5 с) |
| Температура хоста | `vcgencmd measure_temp` — сверить с виджетом телеметрии |
| Удалённая отладка страницы | Временно добавить `--remote-debugging-port=9222` и пробросить порт через `ssh -L 9222:localhost:9222 pi@deskhub.local` |
