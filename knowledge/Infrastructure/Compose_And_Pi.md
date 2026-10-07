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
   │        ├─ deskhub-db   ── healthcheck: pg_isready
   │        └─ deskhub-api  ── depends_on db (healthy) → миграции → /health = 200
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
name: deskhub

services:
  db:
    image: postgres:16-bookworm            # официальный образ, есть linux/arm64
    container_name: deskhub-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: deskhub
      POSTGRES_USER: deskhub
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set in .env}
      TZ: ${TZ:-Europe/Moscow}
    volumes:
      - pgdata:/var/lib/postgresql/data
    # Порты наружу не публикуются: БД доступна только API по внутренней сети compose.
    # Для отладки с хоста можно временно добавить: ports: ["127.0.0.1:5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U deskhub -d deskhub"]
      interval: 5s
      timeout: 3s
      retries: 20
    shm_size: 128mb
    logging: &default-logging
      driver: json-file
      options: { max-size: "10m", max-file: "3" }

  api:
    image: ${DESKHUB_IMAGE:-ghcr.io/<owner>/deskhub-api}:${DESKHUB_IMAGE_TAG:-latest}
    build:                                  # для сборки прямо на Pi: docker compose build
      context: .
      dockerfile: Dockerfile
    container_name: deskhub-api
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "127.0.0.1:5000:8080"               # только localhost: Kiosk на этом же устройстве
    environment:
      ASPNETCORE_ENVIRONMENT: Production
      TZ: ${TZ:-Europe/Moscow}
      ConnectionStrings__DeskHub: "Host=db;Port=5432;Database=deskhub;Username=deskhub;Password=${POSTGRES_PASSWORD}"
      Weather__Latitude: ${WEATHER_LAT}
      Weather__Longitude: ${WEATHER_LON}
      Weather__LocationName: ${WEATHER_LOCATION_NAME}
      Traffic__Provider: ${TRAFFIC_PROVIDER:-TomTom}
      Traffic__ApiKey: ${TRAFFIC_API_KEY:?set in .env}
      Telemetry__ProcRoot: /host/proc
      Telemetry__SysRoot: /host/sys
    volumes:
      - /proc:/host/proc:ro                 # метрики хоста (CPU, RAM, uptime)
      - /sys:/host/sys:ro                   # температура SoC, частота CPU
    # Опционально, для vcgencmd get_throttled (см. Backend_dotnet/Background_Workers.md, 5.1):
    # devices: ["/dev/vcio:/dev/vcio"]
    mem_limit: 768m
    logging: *default-logging

volumes:
  pgdata:
```

### 2.1. Пояснения

| Элемент | Решение и причина |
|---|---|
| **Порт `127.0.0.1:5000:8080`** | API слушает `8080` внутри контейнера, на хосте доступен **только с localhost** — Chromium открывает `http://localhost:5000`. Из LAN API недоступен, поэтому аутентификация не нужна (см. `Backend_dotnet/Core_Architecture.md`, 3.2). |
| **БД без `ports`** | PostgreSQL виден только сервису `api` во внутренней сети compose (`Host=db`). |
| **Вольюм `pgdata`** | Именованный вольюм Docker → данные переживают пересоздание контейнера и обновление образа. Хранится в `/var/lib/docker/volumes/deskhub_pgdata`. При наличии NVMe SSD каталог Docker (`data-root`) рекомендуется перенести на SSD. |
| **`depends_on: service_healthy`** | API стартует после готовности PostgreSQL; ретраи миграций в коде — вторая линия защиты. |
| **`/proc`, `/sys` → `/host/*:ro`** | Явный read-only доступ к метрикам хоста для `TelemetryWorker`. Пути передаются через `Telemetry__ProcRoot/SysRoot`. |
| **`TZ`** | Совпадает с таймзоной хоста — часы пик, ночной режим и retention считаются в локальном времени. |
| **`restart: unless-stopped`** | Автоподъём после перезагрузки Pi и падений; не поднимает контейнер, остановленный вручную. |
| **`logging` с ротацией** | Логи не забивают SD-карту (максимум 30 MB на сервис). |
| **`mem_limit`** | Страховка от утечек; у Pi 8 GB, лимит с большим запасом. |

### 2.2. `.env` (на устройстве, не в git)

```dotenv
# .env.example — скопировать в .env и заполнить
DESKHUB_IMAGE=ghcr.io/<owner>/deskhub-api
DESKHUB_IMAGE_TAG=latest
TZ=Europe/Moscow

POSTGRES_PASSWORD=change-me

WEATHER_LAT=55.75
WEATHER_LON=37.62
WEATHER_LOCATION_NAME=Москва

TRAFFIC_PROVIDER=TomTom
TRAFFIC_API_KEY=change-me
```

Права: `chmod 600 .env`. Синтаксис `${VAR:?…}` прерывает запуск compose, если обязательная переменная не задана.

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

# 4. Каталог проекта
mkdir -p ~/deskhub && cd ~/deskhub
#    сюда: docker-compose.yml, .env, deploy/pi/kiosk.sh

# 5. Первый запуск
docker compose pull      # или: docker compose build
docker compose up -d
curl -fsS http://localhost:5000/health   # → Healthy
```

---

## 4. Kiosk: запуск Chromium

### 4.1. `deploy/pi/kiosk.sh`

```bash
#!/usr/bin/env bash
# DeskHub Kiosk launcher: ждёт готовности API и держит Chromium запущенным.
set -u

URL="http://localhost:5000"
HEALTH_URL="$URL/health"
WAIT_TIMEOUT_SEC=300          # сколько ждать API при холодном старте
LOG="$HOME/.cache/deskhub-kiosk.log"

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
chmod +x ~/deskhub/deploy/pi/kiosk.sh
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
"$HOME/deskhub/deploy/pi/kiosk.sh" &
EOF
```

- Если `~/.config/labwc/autostart` создаётся впервые — системный `/etc/xdg/labwc/autostart` (панель, обои) перестаёт выполняться. Для киоска это желательно: панель задач не нужна.
- Альтернатива — systemd user unit (`~/.config/systemd/user/deskhub-kiosk.service`, `WantedBy=graphical-session.target`, `Restart=always`). Выбран autostart labwc как более простой вариант; при переходе на systemd этот раздел обновляется.

---

## 5. Эксплуатация

### 5.1. Обновление

```bash
cd ~/deskhub
# зафиксировать новый тег в .env: DESKHUB_IMAGE_TAG=<sha>
docker compose pull api
docker compose up -d api          # миграции применяются при старте
docker image prune -f
```

- Chromium перезапускать не нужно: SignalR-клиент переподключится, а фронтенд при обнаружении новой версии сам выполнит `location.reload()` (`Frontend_react/Core.md`, раздел 7).
- **Откат:** вернуть предыдущий тег в `.env` и повторить `up -d`. Если в новой версии были миграции — сначала восстановить бэкап БД.

### 5.2. Бэкап PostgreSQL

```bash
# crontab -e  (ежедневно в 04:00, хранить 14 дней)
0 4 * * * cd ~/deskhub && docker compose exec -T db pg_dump -U deskhub -Fc deskhub > /mnt/backup/deskhub-$(date +\%F).dump && find /mnt/backup -name 'deskhub-*.dump' -mtime +14 -delete
```

Восстановление:

```bash
docker compose exec -T db pg_restore -U deskhub -d deskhub --clean < /mnt/backup/deskhub-YYYY-MM-DD.dump
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
