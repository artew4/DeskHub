# Docker Setup — сборка образа под linux/arm64

> **Назначение документа:** как собирается единый Docker-образ DeskHub (React-фронтенд + ASP.NET Core-бэкенд) под Raspberry Pi 5 (`linux/arm64`).
> Запуск образа и устройство — [`Compose_And_Pi.md`](Compose_And_Pi.md). Раздача статики в рантайме — [`../Backend_dotnet/Core_Architecture.md`](../Backend_dotnet/Core_Architecture.md).

---

## 1. Обзор

Один образ `deskhub-api` содержит **и бэкенд, и собранный фронтенд**: React-билд кладётся в `wwwroot/` приложения .NET и раздаётся через `UseStaticFiles` + SPA fallback.

```
          ┌───────────────────────┐      ┌───────────────────────┐
 Stage 1  │ frontend              │      │ backend               │  Stage 2
 (native) │ node:22-bookworm-slim │      │ dotnet/sdk:10.0       │  (native, cross-compile
          │ npm ci → vite build   │ ───► │ + wwwroot (COPY)      │   под linux-arm64)
          │ → DeskHub.Api/wwwroot │      │ publish -a arm64      │
          └──────────┬────────────┘      └──────────┬────────────┘
                                                    │ COPY /app/publish
                                                    ▼
          ┌──────────────────────────────────────────────────────┐
 Stage 3  │ final — dotnet/aspnet:10.0 (Ubuntu 24.04, linux/arm64)│
 (target) │ /app/DeskHub.Api.dll  +  /app/wwwroot/ (React)        │
          └──────────────────────────────────────────────────────┘
```

Итоговый образ содержит только ASP.NET Core runtime, опубликованное приложение и статику. Node.js, SDK и исходники в него не попадают.

---

## 2. Структура репозитория (для контекста сборки)

```
DeskHub/
├── DeskHub.slnx              ← решение .NET (формат SDK 10)
├── Dockerfile                ← сборка образа (контекст — корень репозитория)
├── .dockerignore
├── docker-compose.yml        ← см. Compose_And_Pi.md
├── .env.example
├── src/
│   ├── DeskHub.Api/          ← ASP.NET Core (.NET 10); wwwroot/ — артефакт сборки фронтенда
│   └── deskhub-ui/           ← React + Vite + TS + Tailwind v3
├── deploy/pi/                ← kiosk.sh, скрипты бэкапа (создаются на этапе деплоя)
└── knowledge/
```

> Фронтенд и локально, и в Docker собирается в `src/DeskHub.Api/wwwroot` (`build.outDir` в `vite.config.ts`). Каталог `wwwroot/` добавлен в `.gitignore` — артефакты сборки в git не хранятся.

---

## 3. Dockerfile

```dockerfile
# syntax=docker/dockerfile:1.7
# Сборка: docker buildx build --platform linux/arm64 -t deskhub-api .
# Подробности: knowledge/Infrastructure/Docker_Setup.md

ARG DOTNET_VERSION=10.0
ARG NODE_VERSION=22

# ───────────── Stage 1: Frontend (Vite build) ─────────────
# Собирается нативно на машине сборки: HTML/JS/CSS не зависят от архитектуры.
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim AS frontend
WORKDIR /src/deskhub-ui

COPY src/deskhub-ui/package.json src/deskhub-ui/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY src/deskhub-ui/ ./
# vite.config.ts: build.outDir = ../DeskHub.Api/wwwroot → /src/DeskHub.Api/wwwroot
RUN npm run build

# ───────────── Stage 2: Backend (dotnet publish под целевую архитектуру) ─────────────
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:${DOTNET_VERSION} AS backend
ARG TARGETARCH
WORKDIR /src

COPY src/DeskHub.Api/DeskHub.Api.csproj DeskHub.Api/
RUN --mount=type=cache,target=/root/.nuget/packages \
    dotnet restore DeskHub.Api/DeskHub.Api.csproj -a $TARGETARCH

COPY src/DeskHub.Api/ DeskHub.Api/
COPY --from=frontend /src/DeskHub.Api/wwwroot DeskHub.Api/wwwroot
RUN --mount=type=cache,target=/root/.nuget/packages \
    dotnet publish DeskHub.Api/DeskHub.Api.csproj \
      -c Release -a $TARGETARCH --no-restore \
      -o /app/publish /p:UseAppHost=false

# ───────────── Stage 3: Runtime (linux/arm64) ─────────────
FROM mcr.microsoft.com/dotnet/aspnet:${DOTNET_VERSION} AS final

# curl — для HEALTHCHECK (в образе aspnet его нет)
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=backend /app/publish ./

ENV ASPNETCORE_HTTP_PORTS=8080 \
    DOTNET_gcServer=0
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
| `aspnet:10.0` (Ubuntu 24.04 Noble) | С .NET 10 дефолтные образы — Ubuntu, Debian-варианты больше не публикуются. Официально поддерживает `arm64`. Chiseled-вариант не используется: в нём нет `apt` для установки `curl` под HEALTHCHECK. |
| Фронт → `wwwroot` до `dotnet publish` | Stage 1 собирает Vite в `/src/DeskHub.Api/wwwroot` (тот же `outDir`, что локально), stage 2 копирует его в проект **перед** publish — файлы попадают в publish-вывод как обычный content. |
| `DOTNET_gcServer=0` | Workstation GC — меньше потребление памяти, достаточно для одного устройства. |
| `USER $APP_UID` | Непривилегированный пользователь `app` (встроен в образы .NET начиная с 8). |
| `HEALTHCHECK` на `/health` | Тот же эндпоинт использует kiosk-скрипт (см. `Compose_And_Pi.md`). |

> Версия .NET задаётся `ARG DOTNET_VERSION` и должна совпадать с `TargetFramework` в `DeskHub.Api.csproj` (`net10.0`).

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
.env
```

`wwwroot` исключён намеренно: он всегда пересобирается в stage 1 и не должен подмешиваться из локальной сборки. Без `.dockerignore` в контекст уходят `node_modules` и `bin/obj` — сотни мегабайт и риск подмешать артефакты хост-архитектуры.

---

## 5. Сборка

### 5.1. Вариант A — на машине разработчика (рекомендуется)

`docker buildx` собирает образ под `linux/arm64` на любом хосте. Stage 1–2 работают нативно, эмуляция нужна только для `RUN apt-get` в final stage.

```bash
# Один раз на x86_64-хосте: регистрация QEMU для arm64 (на Apple Silicon не нужно)
docker run --privileged --rm tonistiigi/binfmt --install arm64

# Один раз: builder с поддержкой multi-platform
docker buildx create --name deskhub --use

# Сборка и публикация в Docker Hub (основной путь деплоя — Compose_And_Pi.md, 5.1)
docker build --platform linux/arm64 -t artembarabash/deskhub:latest . && docker push artembarabash/deskhub:latest
```

Без registry — перенос образа файлом:

```bash
docker buildx build --platform linux/arm64 -t artembarabash/deskhub:latest --load .
docker save artembarabash/deskhub:latest | gzip | ssh pi@deskhub.local 'gunzip | docker load'
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
  with: { username: ${{ secrets.DOCKERHUB_USERNAME }}, password: ${{ secrets.DOCKERHUB_TOKEN }} }   # Docker Hub
- uses: docker/build-push-action@v6
  with:
    platforms: linux/arm64
    push: true
    tags: |
      artembarabash/deskhub:latest
      artembarabash/deskhub:${{ github.sha }}
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

Перед сборкой образа в CI запускаются проверки: `npm run lint && npm run build` в `src/deskhub-ui` и `dotnet test` (когда появится проект тестов).

---

## 6. Версионирование образа

- Сейчас публикуется только `artembarabash/deskhub:latest`, и Pi всегда берёт его (`deploy.sh` → `docker compose pull`). Для быстрого отката рекомендуется дополнительно пушить тег с коротким SHA коммита и при откате временно указывать его в `image:` в `docker-compose.yml` на Pi (`Compose_And_Pi.md`, 5.1).
- Автоперезагрузка киоска после деплоя сделана без номера версии — по `InstanceId` запуска бэкенда (`Frontend_react/Core.md`, раздел 7). (План) Версия приложения через `--build-arg APP_VERSION=<sha>` — для отображения на экране настроек.

---

## 7. Проверка образа

```bash
# Архитектура образа
docker image inspect artembarabash/deskhub:latest --format '{{.Os}}/{{.Architecture}}'   # → linux/arm64

# Размер (факт на .NET 10 / Ubuntu Noble + curl: ~380 MB)
docker image ls artembarabash/deskhub

# Наличие фронтенда внутри
docker run --rm --entrypoint ls artembarabash/deskhub:latest /app/wwwroot   # → index.html(.br/.gz)  assets/
```

> `dotnet publish` в .NET 10 автоматически создаёт пре-сжатые копии статики (`.br`, `.gz`) в `wwwroot`. `UseStaticFiles` их не использует (это умеет `MapStaticAssets`); на работу не влияет, только +~100 KB в образе.
