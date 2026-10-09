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
      # Доступен из локальной сети: http://<ip-pi>:5000. Аутентификации нет — только для домашней сети.
      # DESKHUB_PORT — внешний порт (на Mac 5000 занят AirPlay Receiver: укажите в .env, например, 5050)
      - "${DESKHUB_PORT:-5000}:8080"
    environment:
      ASPNETCORE_ENVIRONMENT: Production
      TZ: ${TZ:-Europe/Moscow}
      ConnectionStrings__DefaultConnection: ${ConnectionStrings__DefaultConnection:?set in .env}
      Weather__City: ${Weather__City:-Moscow}             # погода: https://wttr.in/<City>
      Weather__LocationName: ${Weather__LocationName:-Москва}
      Traffic__Provider: ${Traffic__Provider:-Yandex}   # Yandex | Mock
      Calendar__TimeZone: ${TZ:-Europe/Moscow}
      Telemetry__ProcRoot: /host/proc
      Telemetry__SysRoot: /host/sys
    # Демон питания дисплея на хосте (HDMI off/on через wlr-randr, порт 5055): контейнер ходит к нему
    # по host.docker.internal — knowledge/Infrastructure/Hardware_Display_Power.md
    extra_hosts:
      - "host.docker.internal:host-gateway"
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
| **Порт `${DESKHUB_PORT:-5000}:8080`** | API слушает `8080` внутри контейнера; на хосте — порт 5000 **на всех интерфейсах**: Kiosk открывает `http://localhost:5000`, другие устройства — `http://<ip-pi>:5000`. Аутентификации нет — только для доверенной домашней сети (`Backend_dotnet/Core_Architecture.md`, 3.2). `DESKHUB_PORT` — для локального запуска на Mac, где 5000 занят AirPlay Receiver (`bind: address already in use`). |
| **БД без `ports`** | PostgreSQL виден только сервису `api` во внутренней сети compose (`Host=postgres`). |
| **Вольюм `pgdata`** | Именованный вольюм Docker → данные переживают пересоздание контейнера и обновление образа. Хранится в `/var/lib/docker/volumes/deskhub_pgdata`. При наличии NVMe SSD каталог Docker (`data-root`) рекомендуется перенести на SSD. |
| **`depends_on: service_healthy`** | `api` стартует после готовности сервиса `postgres`; ретраи миграций в коде — вторая линия защиты. |
| **`env_file: .env` (required: false)** | Сервис `api` получает весь `.env` — так передаётся массив календарей `Calendar__Sources__N__*`, который неудобно перечислять в `environment`. Без `.env` запуск не падает. |
| **`/proc`, `/sys` → `/host/*:ro`** | Явный read-only доступ к метрикам хоста для `TelemetryWorker`. Пути передаются через `Telemetry__ProcRoot/SysRoot`. |
| **`extra_hosts: host.docker.internal:host-gateway`** | Имя хоста Pi внутри контейнера (на Linux Docker его сам не создаёт): бэкенд шлёт `POST /sleep` / `/wake` демону питания дисплея на `:5055` (`Hardware_Display_Power.md`). Без демона — только предупреждение в логе. |
| **`TZ`** | Совпадает с таймзоной хоста — часы пик, ночной режим и retention считаются в локальном времени. |
| **`restart: unless-stopped`** | Автоподъём после перезагрузки Pi и падений; не поднимает контейнер, остановленный вручную. |
| **`logging` с ротацией** | Логи не забивают SD-карту (максимум 30 MB на сервис). |
| **Троттлинг (опционально)** | Для `vcgencmd get_throttled` добавить сервису `api`: `devices: ["/dev/vcio:/dev/vcio"]` (см. `Backend_dotnet/Background_Workers.md`, 5.1). |

### 2.2. `.env` (на устройстве, не в git)

```dotenv
# Скопировать в .env и заполнить. Файл .env в git не коммитится.

TZ=Europe/Moscow

# Внешний порт дашборда (по умолчанию 5000). На Mac порт 5000 занят AirPlay Receiver — для локального запуска поставьте, например, 5050
# DESKHUB_PORT=5000

# --- PostgreSQL ---
POSTGRES_DB=deskhub
POSTGRES_USER=deskhub
POSTGRES_PASSWORD=change-me

# Строка подключения API (Host = имя сервиса в docker-compose); пароль должен совпадать с POSTGRES_PASSWORD
ConnectionStrings__DefaultConnection=Host=postgres;Port=5432;Database=deskhub;Username=deskhub;Password=change-me

# --- Погода: wttr.in (ключ не нужен; Open-Meteo/Hetzner заблокирован провайдером в РФ) ---
Weather__City=Moscow
Weather__LocationName=Москва

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

Скрипт хранится **только в репозитории** (`deploy/pi/kiosk.sh`) — это единственный источник истины, копия здесь не дублируется. Что он делает:

1. Ждёт готовности API: опрашивает `http://localhost:5000/health` каждые 2 с, до 300 с (раздел 4.3).
2. В бесконечном цикле `while true` перед **каждым** запуском Chromium:
   - пишет в лог состояние памяти (`free -h`);
   - удаляет и заново создаёт профиль `/dev/shm/chromium-kiosk` (раздел 4.5);
   - запускает Chromium с профилем в RAM (`--user-data-dir`) и флагами киоска (раздел 4.2).
3. Chromium упал или закрыт → запись «Chromium exited with code N», пауза 5 с, повторное ожидание `/health` (если упал вместе с API) и новый круг.

Лог — `~/.cache/deskhub-kiosk.log`.

```bash
scp deploy/pi/kiosk.sh pi@deskhub.local:~/deskhub/   # с Mac
chmod +x ~/deskhub/kiosk.sh                          # на Pi
```

### 4.2. Флаги Chromium

| Флаг | Назначение |
|---|---|
| `--kiosk` | Полный экран без UI браузера, выйти нельзя обычными средствами |
| `--user-data-dir=/dev/shm/chromium-kiosk` | Профиль в RAM, пересоздаётся перед каждым запуском (раздел 4.5). Заменил `--incognito`: чистый старт без диалога «восстановить вкладки» и без накопления кэша сохраняется. `localStorage` (например, яркость экрана) переживает перезагрузку страницы и деплой (InstanceId-reload), но **не перезапуск Chromium** — всё важное хранится на бэкенде. |
| `--app=http://localhost:5000` | Открыть приложение как отдельное окно-приложение |
| `--ozone-platform=wayland` | Нативный Wayland-бэкенд под labwc |
| `--noerrdialogs`, `--disable-infobars`, `--disable-session-crashed-bubble` | Никаких всплывающих панелей и диалогов поверх UI |
| `--disable-crash-reporter` | Не собирать и не отправлять краш-дампы: не тратит CPU/RAM/диск после падения, перезапуск быстрее |
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


### 4.5. Надёжность киоска: профиль в RAM и журнал памяти

**Проблема.** При аварийном завершении (OOM, падение GPU-процесса, выключение питания) Chromium оставляет в профиле `SingletonLock` / `SingletonSocket` / `SingletonCookie`. Следующий запуск с тем же профилем видит «чужой» lock и не стартует или открывает пустое окно — киоск остаётся без дашборда до ручного вмешательства. Кроме того, круглосуточная работа 24/7 может давать утечки памяти, и без истории не понять, почему браузер упал.

**Решение в `kiosk.sh`:**
- **Профиль в RAM-диске** — `PROFILE_DIR=/dev/shm/chromium-kiosk` (`tmpfs`): кэш и служебные файлы не пишутся на SD-карту (не изнашивают её) и не переживают перезагрузку Pi.
- **Жёсткая зачистка перед каждым запуском** — `rm -rf "$PROFILE_DIR"` + `mkdir -p` в начале каждой итерации цикла: никакого lock от упавшего процесса, каждый старт с чистого профиля.
- **Снимок памяти перед каждым запуском** — `free -h >> "$LOG"`: рядом с «Chromium exited with code N» видно, сколько было занято RAM/swap. Растущий `used` между перезапусками или почти нулевой `available` — признак утечки или OOM-killer (подтвердить: `journalctl -k | grep -i oom`).

```bash
tail -n 50 ~/.cache/deskhub-kiosk.log      # история запусков и память
du -sh /dev/shm/chromium-kiosk             # размер профиля в RAM (обычно десятки МБ)
```

### 4.6. Демон питания дисплея (`deploy/pi/display_manager.py`)

Второй хостовый скрипт в репозитории — HTTP-демон на порту 5055 (systemd-сервис `deskhub-display`), который гасит HDMI через `wlr-randr` и будит экран по касанию тачскрина (`/dev/input/event5`). Устройство, установка и диагностика — `Hardware_Display_Power.md`.

```bash
scp deploy/pi/display_manager.py pi@deskhub.local:~/deskhub/   # с Mac; затем sudo systemctl restart deskhub-display
```

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
