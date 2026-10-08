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
