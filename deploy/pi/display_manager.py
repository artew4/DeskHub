import os
import subprocess
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.request
from evdev import InputDevice, ecodes

EVENT_DEVICE = '/dev/input/event5'
OUTPUT_NAME = 'HDMI-A-1'
OUTPUT_MODE = '1024x600'
DESKHUB_URL = 'http://localhost:5000/api/system/wake'

os.environ['WAYLAND_DISPLAY'] = 'wayland-0'
os.environ['XDG_RUNTIME_DIR'] = '/run/user/1000'

is_sleeping = False
lock = threading.Lock()
stop_touch_event = threading.Event()

def screen_off():
    subprocess.run(['wlr-randr', '--output', OUTPUT_NAME, '--off'], check=False)

def screen_on():
    subprocess.run(['wlr-randr', '--output', OUTPUT_NAME, '--on', '--mode', OUTPUT_MODE], check=False)

def touch_listener():
    global is_sleeping
    try:
        dev = InputDevice(EVENT_DEVICE)
        while dev.read_one(): pass
        for event in dev.read_loop():
            if stop_touch_event.is_set():
                break
            if event.type == ecodes.EV_KEY and event.code == ecodes.BTN_TOUCH and event.value == 1:
                with lock:
                    if is_sleeping:
                        screen_on()
                        is_sleeping = False
                        stop_touch_event.set()
                        try:
                            req = urllib.request.Request(DESKHUB_URL, method='POST')
                            urllib.request.urlopen(req, timeout=2)
                        except Exception:
                            pass
                break
    except Exception as e:
        print(f"Touch listener error: {e}")

class ControlHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        global is_sleeping
        if self.path == '/sleep':
            with lock:
                if not is_sleeping:
                    is_sleeping = True
                    screen_off()
                    stop_touch_event.clear()
                    threading.Thread(target=touch_listener, daemon=True).start()
            self.send_response(200)
            self.end_headers()
        elif self.path == '/wake':
            with lock:
                if is_sleeping:
                    stop_touch_event.set()
                    screen_on()
                    is_sleeping = False
            self.send_response(200)
            self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        return

if __name__ == '__main__':
    server = HTTPServer(('0.0.0.0', 5055), ControlHandler)
    server.serve_forever()
