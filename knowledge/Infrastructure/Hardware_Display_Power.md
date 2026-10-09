# Аппаратное питание дисплея: HDMI off/on и пробуждение касанием

> Часть логики питания экрана живёт **на самой Raspberry Pi вне Docker**: Python-демон `display_manager.py` (systemd-сервис).
> Документ — источник истины для развёртывания этого демона на новом устройстве.
> Исходники хостовых скриптов — в репозитории: `deploy/pi/display_manager.py` (этот документ), `deploy/pi/kiosk.sh` (`Compose_And_Pi.md`, раздел 4).
> Связанные документы: `Backend_dotnet/Background_Workers.md` (раздел 9 — `PowerModeService`), `Frontend_react/Feature_Dashboard.md` (раздел 10 — режимы питания в UI), `Compose_And_Pi.md` (compose и подготовка Pi).

---

## 1. Архитектурное решение

**Проблема.** Матрица MPI7002 (7", 1024×600) **не поддерживает DDC/CI** (по i2c не отвечает) — программно погасить подсветку нельзя. Чёрный `PowerOverlay` в браузере даёт чёрную картинку, но подсветка продолжает светиться и греться.

**Решение — аппаратный хак.** Хост (Raspberry Pi 5, Wayland/labwc) **гасит видеосигнал**: `wlr-randr --output HDMI-A-1 --off`. Матрица видит «No Signal» и засыпает (подсветка гаснет). **Тачскрин** — отдельное USB-устройство ввода (`/dev/input/event5`) — продолжает работать и служит триггером пробуждения: демон читает сырые события **evdev** напрямую, минуя композитор (у Wayland без выхода некуда доставлять события в окна, а evdev их видит всегда).

```
                 ┌──────────────── Docker ────────────────┐
                 │  deskhub-api (.NET)                    │
                 │  PowerModeService                      │
  расписание ───►│   ├─ → Sleep  ──► DisplayHostClient ───┼── POST /sleep ──┐
  кнопка сна ───►│   └─ ← Sleep  ──► DisplayHostClient ───┼── POST /wake  ──┤  host.docker.internal:5055
                 │                                        │                 │  (extra_hosts: host-gateway)
                 │  POST /api/system/wake ◄───────────────┼──────────┐      │
                 └────────────────────────────────────────┘          │      ▼
                                                                     │  ┌─────────── Хост (Pi) ───────────┐
                                                                     │  │ display_manager.py (systemd)    │
                                                                     │  │  /sleep → wlr-randr --off       │
                                                                     │  │          + слушает evdev        │
                                                                     │  │  касание (BTN_TOUCH=1) →        │
                                                                     └──┼─ wlr-randr --on + POST wake     │
                                                                        │  /wake  → wlr-randr --on        │
                                                                        └─────────────────────────────────┘
```

**Последовательность «уснуть»:**
1. `PowerModeService` переходит в `Sleep` — по расписанию (01:30), кнопкой «В режим сна» (`SetSleepMode`) или по окончании 5-минутного пробуждения ночью. Любой будущий источник (например, уход BLE-метки) получит то же поведение автоматически, если переводит режим через `PowerModeService`: хук стоит на **смене режима**, а не на конкретной причине.
2. Бэкенд рассылает `PowerModeChanged(sleep)` (браузер показывает чёрный `PowerOverlay`, интерфейс `display: none`) и **фоном** шлёт `POST http://host.docker.internal:5055/sleep` (`DisplayHostClient`, таймаут 2 с).
3. Демон выполняет `wlr-randr --output HDMI-A-1 --off` и начинает слушать тачскрин.

**Последовательность «проснуться» (касание):**
1. Палец на погашенном экране → демон видит `EV_KEY / BTN_TOUCH / value=1` → `wlr-randr --on` → `POST http://localhost:5000/api/system/wake`.
2. Бэкенд (`WakeTemporarily()`): снимает принудительный сон; днём → `Normal`, ночью (по расписанию Sleep) → `Dimmed` на 5 минут; рассылает `PowerModeChanged`.
3. Браузер убирает `PowerOverlay`, интерфейс снова виден, часы и анимации идут; воркеры погоды/календаря подхватывают данные в течение минуты (проверяют режим раз в минуту), пробки — по пингу видимости.
4. Параллельно то же касание обычно доходит и до Chromium (`PowerOverlay` → `WakeScreen`) — вызовы идемпотентны, повторное касание не продлевает пробуждение.

**Последовательность «проснуться» без касания** (утро 08:00, конец принудительного сна, касание пришло только в браузер): бэкенд выходит из `Sleep` и шлёт `POST /wake` → демон `wlr-randr --on`. Без этого экран после ночи оставался бы без сигнала до первого касания.

**Надёжность:**
- Демона нет (разработка на Mac, демон упал) → бэкенд пишет одно предупреждение «Display host unavailable (sleep|wake)» на каждую смену режима и работает как обычно; экран просто остаётся программно-чёрным.
- Бэкенд недоступен → демон всё равно включает HDMI по касанию; браузер получит актуальный режим после реконнекта (snapshot).
- Запросы `sleep`/`wake` выстраиваются в цепочку (не обгоняют друг друга); демон идемпотентен (`/sleep` во сне и `/wake` наяву — без эффекта, кроме повторного `wlr-randr`).

**Безопасность.** Демон слушает `0.0.0.0:5055` — контейнер ходит к нему через шлюз Docker-моста, на `127.0.0.1` он недоступен. Значит, погасить/включить экран может любой в домашней сети (как и открыть дашборд — аутентификации нет, `Backend_dotnet/Core_Architecture.md`, 3.2). `POST /api/system/wake` тоже без аутентификации — он только будит экран. Для недоверенной сети — закрыть 5055 файрволом для всех, кроме подсети Docker (раздел 6).

---

## 2. Настройки бэкенда и compose

| Где | Что |
|---|---|
| `docker-compose.yml`, сервис `api` | `extra_hosts: ["host.docker.internal:host-gateway"]` — имя хоста внутри контейнера (на Linux Docker сам его не создаёт) |
| `Power:DisplayHostUrl` (`appsettings.json`, env `Power__DisplayHostUrl`) | По умолчанию `http://host.docker.internal:5055/` (с завершающим `/`). **Пусто — аппаратное отключение выключено** (только программный чёрный экран) |
| `POST /api/system/wake` | Эндпоинт для демона: `PowerModeService.WakeTemporarily()`, ответ — `PowerModeModel` |
| Порт для демона | Демон стучится в `http://localhost:5000` — внешний порт API (`DESKHUB_PORT`, по умолчанию 5000) |

---

## 3. Подготовка хоста (один раз)

```bash
sudo apt-get update && sudo apt-get install -y python3-evdev
sudo usermod -aG input admin     # чтение /dev/input/event* без root; перелогиниться
```

`wlr-randr` в Raspberry Pi OS Bookworm (labwc) уже установлен. Проверить имя выхода и устройство тачскрина:

```bash
wlr-randr                                  # имя выхода: HDMI-A-1
ls -l /dev/input/by-id/ /dev/input/by-path/ # стабильные ссылки на тачскрин
python3 -m evdev.evtest                     # выбрать устройство, коснуться — должны идти BTN_TOUCH
```

> **Номер `eventN` может меняться** между загрузками и при переподключении USB. Надёжнее указать в `EVENT_DEVICE` (константа в начале `display_manager.py`) ссылку из `/dev/input/by-id/…-event-if00` (или `by-path`).

---

## 4. Демон `display_manager.py`

**Исходник — в репозитории: [`deploy/pi/display_manager.py`](../../deploy/pi/display_manager.py)** (единственный источник истины; на Pi — `/home/admin/deskhub/display_manager.py`). Только стандартная библиотека Python + `python3-evdev`. Параметры — константы в начале файла:

| Константа | Значение | Назначение |
|---|---|---|
| `EVENT_DEVICE` | `/dev/input/event5` | Тачскрин (сырой ввод evdev) |
| `OUTPUT_NAME` | `HDMI-A-1` | Видеовыход для `wlr-randr` |
| `OUTPUT_MODE` | `1024x600` | Режим, который задаётся при включении (выход после `--off` не всегда возвращается в нужное разрешение сам) |
| `DESKHUB_URL` | `http://localhost:5000/api/system/wake` | Куда сообщить о касании |
| `WAYLAND_DISPLAY`, `XDG_RUNTIME_DIR` | `wayland-0`, `/run/user/1000` | Выставляются в самом скрипте — `wlr-randr` подключается к композитору labwc пользователя `admin` |

**Как работает:**
- `HTTPServer` на `0.0.0.0:5055` (контейнер ходит через шлюз Docker-моста, на `127.0.0.1` он недоступен); логи HTTP отключены.
- **`POST /sleep`** — если ещё не спит: флаг `is_sleeping`, `wlr-randr --output HDMI-A-1 --off` (матрица уходит в «No Signal»), сброс `stop_touch_event` и запуск фонового потока `touch_listener`. Повторный `/sleep` во сне — без эффекта.
- **`touch_listener`** — открывает `/dev/input/event5` (без `grab()` — касание доходит и до Chromium), вычитывает накопившиеся события (`read_one()` до пустоты — чтобы старое касание не разбудило экран сразу), затем блокирующе читает `read_loop()`. На первом `EV_KEY / BTN_TOUCH / value=1`: под `lock` — `wlr-randr --on --mode 1024x600`, `is_sleeping = False`, `stop_touch_event.set()` и `POST` в DeskHub (`/api/system/wake`, таймаут 2 с, ошибка игнорируется). Ошибка открытия устройства печатается в журнал («Touch listener error: …»).
- **`POST /wake`** — бэкенд вышел из Sleep без касания (утро, касание дошло до браузера): если спит — `stop_touch_event.set()`, `wlr-randr --on --mode …`, `is_sleeping = False`.
- Любой другой путь — `404`.

**Особенности текущей реализации** (учитывать при доработке):
- `read_loop()` блокирующий: после `/wake` поток касаний завершится только на следующем событии тачскрина (проверка `stop_touch_event` — внутри цикла). Если до этого снова придёт `/sleep`, некоторое время работают два потока; это безопасно — касание обработает тот, кто первым возьмёт `lock`, второй увидит `is_sleeping = False`.
- `HTTPServer` однопоточный: запросы обрабатываются по очереди (бэкенд и так шлёт `sleep`/`wake` последовательно).
- Номер `event5` может смениться после перезагрузки или переподключения USB — тогда поменять `EVENT_DEVICE` (надёжнее — ссылка из `/dev/input/by-id/`).

Обновление на устройстве:

```bash
scp deploy/pi/display_manager.py admin@deskhub.local:~/deskhub/
ssh admin@deskhub.local 'sudo systemctl restart deskhub-display'
```

---

## 5. systemd-сервис

`/etc/systemd/system/deskhub-display.service`:

```ini
[Unit]
Description=DeskHub display power manager (HDMI off/on, wake on touch)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=admin
Group=admin
SupplementaryGroups=input
# WAYLAND_DISPLAY / XDG_RUNTIME_DIR скрипт выставляет сам (uid admin = 1000 — проверить: `id -u admin`)
Environment=PYTHONUNBUFFERED=1
ExecStart=/usr/bin/python3 /home/admin/deskhub/display_manager.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Установка и проверка:

```bash
scp deploy/pi/display_manager.py admin@deskhub.local:~/deskhub/
sudo nano /etc/systemd/system/deskhub-display.service      # содержимое выше
sudo systemctl daemon-reload
sudo systemctl enable --now deskhub-display
systemctl status deskhub-display
journalctl -u deskhub-display -f                           # ошибки потока касаний: «Touch listener error: …»

# Ручная проверка с хоста: экран гаснет, касание — включается и будит бэкенд
curl -X POST http://localhost:5055/sleep
curl -X POST http://localhost:5055/wake
# Из контейнера (проверка extra_hosts)
docker exec deskhub-api sh -c 'getent hosts host.docker.internal'
```

`WAYLAND_DISPLAY` — имя сокета в `/run/user/<uid>/` (`ls /run/user/1000/wayland-*`); если отличается от `wayland-0` или uid не 1000 — поправить константы в начале скрипта. Ошибка `wlr-randr` (композитор ещё не запущен) не роняет демон (`check=False`).

---

## 6. Эксплуатация и диагностика

| Симптом | Причина / что проверить |
|---|---|
| В логе API «Display host unavailable (sleep): … Connection refused» | Демон не запущен: `systemctl status deskhub-display` |
| «… Name or service not known (host.docker.internal:5055)» | Нет `extra_hosts` в compose на Pi — скопировать свежий `docker-compose.yml` и `./deploy.sh` |
| «… timed out» / нет ответа | Файрвол режет 5055 от Docker-моста; демон слушает не `0.0.0.0` |
| Экран гаснет, но касание не будит | `journalctl -u deskhub-display`: «Touch listener error: … /dev/input/event5» — сменился номер устройства (поправить `EVENT_DEVICE`, лучше на `by-id`) или пользователь не в группе `input` |
| Касание включает HDMI, но остаётся чёрный экран | Демон не достучался до `/api/system/wake` (ошибка молча игнорируется) — проверить `DESKHUB_URL`/порт (`DESKHUB_PORT`); при этом то же касание в браузере обычно будит через хаб |
| `wlr-randr` ругается на подключение к композитору | Неверные `XDG_RUNTIME_DIR` / `WAYLAND_DISPLAY` в начале скрипта |
| Утром экран без сигнала до касания | На Pi старая версия демона без `/wake` (в логе API — «Display host: wake → HTTP 404») — скопировать `deploy/pi/display_manager.py` |

Ограничить 5055 только Docker-подсетью (опционально, nftables/ufw): разрешить вход на 5055 с `172.16.0.0/12`, остальное — drop.
