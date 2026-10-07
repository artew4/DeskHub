# Docker Setup — сборка образа под linux/arm64

> **Назначение документа:** как собирается единый Docker-образ DeskHub (React-фронтенд + ASP.NET Core-бэкенд) под Raspberry Pi 5 (`linux/arm64`).
> Запуск образа и устройство — [`Compose_And_Pi.md`](Compose_And_Pi.md). Раздача статики в рантайме — [`../Backend_dotnet/Core_Architecture.md`](../Backend_dotnet/Core_Architecture.md).

---

## 1. Обзор

Один образ `deskhub-api` содержит **и бэкенд, и собранный фронтенд**: React-билд кладётся в `wwwroot/` приложения .NET и раздаётся через `UseStaticFiles` + SPA fallback.

```
          ┌───────────────────────┐      ┌───────────────────────┐
 Stage 1  │ frontend              │      │ backend               │  Stage 2
 (native) │ node:22-bookworm-slim │      │ dotnet/sdk:8.0        │  (native, cross-compile
          │ npm ci → vite build   │      │ restore → publish     │   под linux-arm64)
          │   → /out/wwwroot      │      │   -a arm64 → /app/pub │
          └──────────┬────────────┘      └──────────┬────────────┘
                     │ COPY                         │ COPY
                     ▼                              ▼
          ┌──────────────────────────────────────────────────────┐
 Stage 3  │ final — dotnet/aspnet:8.0-bookworm-slim (linux/arm64) │
 (target) │ /app/DeskHub.Api.dll  +  /app/wwwroot/ (React)        │
          └──────────────────────────────────────────────────────┘
```

Итоговый образ содержит только ASP.NET Core runtime, опубликованное приложение и статику. Node.js, SDK и исходники в него не попадают.

---

## 2. Структура репозитория (для контекста сборки)

```
DeskHub/
├── Dockerfile                ← сборка образа (контекст — корень репозитория)
├── .dockerignore
├── docker-compose.yml        ← см. Compose_And_Pi.md
├── .env.example
├── frontend/                 ← React + Vite (package.json, src/, vite.config.ts)
├── backend/                  ← DeskHub.sln, global.json, src/DeskHub.Api, tests/
├── deploy/pi/                ← kiosk.sh, autostart, скрипты бэкапа
└── knowledge/
```

> Фронтенд в локальной разработке собирается в `backend/src/DeskHub.Api/wwwroot` (`build.outDir` в `vite.config.ts`). Каталог `wwwroot/` добавлен в `.gitignore` — артефакты сборки в git не хранятся.

---

## 3. Dockerfile

```dockerfile
# syntax=docker/dockerfile:1.7
ARG DOTNET_VERSION=8.0
ARG NODE_VERSION=22

# ───────────── Stage 1: Frontend (Vite build) ─────────────
# --platform=$BUILDPLATFORM: собираем на нативной архитектуре сборочной машины.
# Результат (HTML/JS/CSS) не зависит от архитектуры — эмуляция не нужна.
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim AS frontend
WORKDIR /src/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY frontend/ ./
RUN npm run build -- --outDir /out/wwwroot --emptyOutDir

# ───────────── Stage 2: Backend (dotnet publish) ─────────────
# SDK тоже работает нативно и кросс-компилирует под целевую архитектуру (-a $TARGETARCH).
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:${DOTNET_VERSION} AS backend
ARG TARGETARCH
WORKDIR /src

# Сначала только файлы проектов — слой restore кэшируется, пока не меняются зависимости
COPY backend/global.json ./
COPY backend/src/DeskHub.Api/DeskHub.Api.csproj src/DeskHub.Api/
RUN --mount=type=cache,target=/root/.nuget/packages \
    dotnet restore src/DeskHub.Api/DeskHub.Api.csproj -a $TARGETARCH

COPY backend/ ./
RUN --mount=type=cache,target=/root/.nuget/packages \
    dotnet publish src/DeskHub.Api/DeskHub.Api.csproj \
      -c Release -a $TARGETARCH --no-restore \
      -o /app/publish /p:UseAppHost=false

# ───────────── Stage 3: Runtime (целевая платформа linux/arm64) ─────────────
FROM mcr.microsoft.com/dotnet/aspnet:${DOTNET_VERSION}-bookworm-slim AS final

# curl — для HEALTHCHECK (в образе aspnet его нет)
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=backend  /app/publish  ./
COPY --from=frontend /out/wwwroot  ./wwwroot

ENV ASPNETCORE_HTTP_PORTS=8080 \
    DOTNET_gcServer=0 \
    DOTNET_GCHeapHardLimit=0x20000000
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=5 \
  CMD curl -fsS http://localhost:8080/health || exit 1

USER $APP_UID
ENTRYPOINT ["dotnet", "DeskHub.Api.dll"]
```

### 3.1. Пояснения к ключевым решениям

| Решение | Причина |
|---|---|
| `--platform=$BUILDPLATFORM` для stage 1–2 | Node и .NET SDK работают **нативно** (быстро), без эмуляции QEMU. Под QEMU `npm ci` и `dotnet publish` медленнее в 5–10 раз и иногда падают. |
| `dotnet publish -a $TARGETARCH` | Кросс-компиляция: `TARGETARCH=arm64` → RID `linux-arm64`. Вариант framework-dependent (`UseAppHost=false`) — runtime уже есть в базовом образе. |
| `restore` отдельным слоем | Кэш зависимостей NuGet переиспользуется, пока не меняются `.csproj`. То же для `npm ci` и `package-lock.json`. |
| `--mount=type=cache` | Кэш npm/NuGet между сборками (BuildKit). |
| `aspnet:*-bookworm-slim` | Debian-based, официально поддерживает `arm64`; совместим с glibc Raspberry Pi OS. |
| `npm run build -- --outDir /out/wwwroot` | Переопределяет `build.outDir` из `vite.config.ts` только для Docker, без изменения конфига. Требует, чтобы скрипт `build` заканчивался вызовом `vite build`. |
| `DOTNET_gcServer=0` | Workstation GC — меньше потребление памяти, достаточно для одного устройства. |
| `DOTNET_GCHeapHardLimit` (512 MB) | Ограничение кучи — страховка от утечек в 24/7-режиме. Подбирается по факту потребления. |
| `USER $APP_UID` | Непривилегированный пользователь `app` (встроен в образы .NET 8+). |
| `HEALTHCHECK` на `/health` | Тот же эндпоинт использует kiosk-скрипт (см. `Compose_And_Pi.md`). |

> **.NET 9:** достаточно передать `--build-arg DOTNET_VERSION=9.0`. Версия должна совпадать с `global.json`.

---

## 4. `.dockerignore`

```gitignore
**/node_modules
**/dist
**/bin
**/obj
**/wwwroot
**/.vite
**/*.user
.git
.github
.vscode
.idea
knowledge
*.md
.env
```

Без него в контекст сборки уходят `node_modules` и `bin/obj` — сотни мегабайт и риск подмешать артефакты хост-архитектуры.

---

## 5. Сборка

### 5.1. Вариант A — на машине разработчика (рекомендуется)

`docker buildx` собирает образ под `linux/arm64` на любом хосте. Stage 1–2 работают нативно, эмуляция нужна только для `RUN apt-get` в final stage.

```bash
# Один раз на x86_64-хосте: регистрация QEMU для arm64 (на Apple Silicon не нужно)
docker run --privileged --rm tonistiigi/binfmt --install arm64

# Один раз: builder с поддержкой multi-platform
docker buildx create --name deskhub --use

# Сборка и публикация в registry
docker buildx build \
  --platform linux/arm64 \
  --build-arg DOTNET_VERSION=8.0 \
  -t ghcr.io/<owner>/deskhub-api:$(git rev-parse --short HEAD) \
  -t ghcr.io/<owner>/deskhub-api:latest \
  --push .
```

Без registry — перенос образа файлом:

```bash
docker buildx build --platform linux/arm64 -t deskhub-api:latest --load .
docker save deskhub-api:latest | gzip | ssh pi@deskhub.local 'gunzip | docker load'
```

### 5.2. Вариант B — прямо на Raspberry Pi

```bash
docker compose build        # платформа хоста = linux/arm64, ничего указывать не нужно
```

Работает, но медленнее (npm ci + dotnet publish на Pi 5 — несколько минут) и нагружает SD-карту. Подходит для разовых сборок.

### 5.3. CI (GitHub Actions, эскиз)

```yaml
- uses: docker/setup-qemu-action@v3
- uses: docker/setup-buildx-action@v3
- uses: docker/login-action@v3
  with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
- uses: docker/build-push-action@v6
  with:
    platforms: linux/arm64
    push: true
    tags: ghcr.io/${{ github.repository_owner }}/deskhub-api:${{ github.sha }}
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

Перед сборкой образа в CI запускаются тесты: `npm run lint && npm test` (frontend) и `dotnet test` (backend).

---

## 6. Версионирование образа

- Тег = короткий SHA коммита + `latest`. На устройстве в `.env` фиксируется конкретный тег (`DESKHUB_IMAGE_TAG`), чтобы обновление было явным и откатываемым.
- Версия приложения (`__APP_VERSION__` во фронтенде, `InformationalVersion` в .NET) передаётся через `--build-arg APP_VERSION=<sha>` и отображается на экране настроек.

---

## 7. Проверка образа

```bash
# Архитектура образа
docker image inspect deskhub-api:latest --format '{{.Os}}/{{.Architecture}}'   # → linux/arm64

# Размер (ориентир: ~230–260 MB)
docker image ls deskhub-api

# Наличие фронтенда внутри
docker run --rm --entrypoint ls deskhub-api:latest /app/wwwroot   # → index.html  assets/
```
