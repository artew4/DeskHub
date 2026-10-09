# DeskHub

Персональная настольная инфо-станция (Kiosk-терминал) на Raspberry Pi 5 с сенсорным экраном 1024×600: часы, погода, пробки «Дом → Работа», календари iCloud/Outlook, виртуальный кот и телеметрия Pi.

- **Frontend:** React + Vite + TypeScript + Tailwind (`src/deskhub-ui`)
- **Backend:** ASP.NET Core (.NET 10), SignalR, фоновые воркеры (`src/DeskHub.Api`)
- **Доставка:** один Docker-образ `linux/arm64` (фронтенд раздаётся бэкендом) + PostgreSQL в `docker compose`

Архитектура, правила и устройство модулей — в базе знаний: [`knowledge/README.md`](knowledge/README.md).

---

## Деплой на Raspberry Pi (Production)

### Схема

```
Mac (Apple Silicon, arm64)                Docker Hub                       Raspberry Pi 5 (arm64)
docker build --platform linux/arm64  →   artembarabash/deskhub:latest  →  ~/deskhub/deploy.sh
docker push                                                               (docker compose pull + up -d)
```

Mac и Pi 5 — обе платформы ARM64, поэтому образ собирается нативно, без эмуляции.

### 1. Сборка и публикация образа (на Mac)

Один раз — войти в Docker Hub:

```bash
docker login
```

Сборка и публикация (из корня репозитория):

```bash
docker build --platform linux/arm64 -t artembarabash/deskhub:latest . && docker push artembarabash/deskhub:latest
```

> **Что попадает в образ.** Только приложение и собранный фронтенд. Секреты (`.env`, ссылки календарей, пароль БД) в образ **не** попадают: `.env` исключён в `.dockerignore`, все секреты подаются на Pi в рантайме через `.env`. Репозиторий на Docker Hub по умолчанию **публичный** — при желании сделайте его приватным в настройках Docker Hub (тогда на Pi тоже нужен `docker login`).

### 2. Первая установка на Raspberry Pi

**Предварительно:** на Pi установлен Docker с плагином compose (`curl -fsSL https://get.docker.com | sh`, затем `sudo usermod -aG docker $USER` и перелогиниться) — подробности в [`knowledge/Infrastructure/Compose_And_Pi.md`](knowledge/Infrastructure/Compose_And_Pi.md), раздел 3.

1. Создать папку проекта на Pi:

   ```bash
   mkdir -p ~/deskhub
   ```

2. Скопировать туда с Mac файлы `docker-compose.yml`, `.env`, `deploy.sh` и скрипт киоска `deploy/pi/kiosk.sh`:

   ```bash
   scp docker-compose.yml .env deploy.sh deploy/pi/kiosk.sh pi@deskhub.local:~/deskhub/
   ```

   `.env` — заполненная копия [`.env.example`](.env.example) с **реальными** секретами:
   - `POSTGRES_PASSWORD` и тот же пароль внутри `ConnectionStrings__DefaultConnection`;
   - `Calendar__Sources__N__Url` / `__Color` — ссылки календарей iCloud/Outlook;
   - `TZ`, координаты для погоды при необходимости.

3. Сделать скрипт исполняемым и закрыть `.env` от чужих глаз:

   ```bash
   cd ~/deskhub
   chmod +x deploy.sh kiosk.sh
   chmod 600 .env
   ```

4. Первый запуск:

   ```bash
   ./deploy.sh
   ```

5. Проверить (дашборд доступен и с других устройств домашней сети — `http://<ip-pi>:5000`; аутентификации нет, поэтому только для доверенной сети):

   ```bash
   docker compose ps                          # api и postgres — healthy
   curl -fsS http://localhost:5000/health     # Healthy
   ```

6. Включить автозапуск Chromium в режиме Kiosk (`kiosk.sh` ждёт готовности API, запускает Chromium с `--kiosk --incognito --app=http://localhost:5000` и перезапускает его при падении):

   ```bash
   mkdir -p ~/.config/labwc
   echo '"$HOME/deskhub/kiosk.sh" &' >> ~/.config/labwc/autostart
   ```

   Автологин в рабочий стол и отключение гашения экрана — [`knowledge/Infrastructure/Compose_And_Pi.md`](knowledge/Infrastructure/Compose_And_Pi.md), разделы 3–4.

### 3. Обновление

1. На Mac — пересобрать и запушить образ (команда из шага 1).
2. На Pi — просто запустить:

   ```bash
   ~/deskhub/deploy.sh
   ```

   Скрипт скачивает свежие образы (`docker compose pull`), пересоздаёт изменившиеся контейнеры (`docker compose up -d`) и удаляет старые образы (`docker image prune -f`). Данные PostgreSQL живут в томе `pgdata` и при обновлении не теряются.

   **Киоск обновится сам:** после перезапуска контейнера фронтенд переподключается к SignalR, видит новый `InstanceId` бэкенда и перезагружает страницу — через пару секунд на экране новая версия. Перезапускать Chromium не нужно.

   Можно запускать и прямо с Mac: `ssh pi@deskhub.local '~/deskhub/deploy.sh'`.

> Если изменился `docker-compose.yml` или в `.env` добавились переменные — скопируйте обновлённые файлы на Pi (как в шаге 2) перед `./deploy.sh`.
>
> На Pi нет исходников, поэтому там не запускайте `docker compose build` / `up --build` — образ всегда берётся из Docker Hub.

---

## Локальная разработка

```bash
# Backend (http://localhost:5000); секреты календарей — в .NET user-secrets
cd src/DeskHub.Api && dotnet run

# Frontend с hot reload (http://localhost:5173, /api и /hubs проксируются на :5000)
cd src/deskhub-ui && npm install && npm run dev

# Всё в Docker локально (на Mac порт 5000 занят AirPlay Receiver — задайте другой)
cp .env.example .env   # заполнить, добавить DESKHUB_PORT=5050
docker compose up --build   # → http://localhost:5050
```
