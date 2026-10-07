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
