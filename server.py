import http.server
import socketserver
import os
import sys

# اطبع كل متغيرات البيئة المتعلقة بالبورت
print("=== STARTUP DIAGNOSTICS ===", flush=True)
print(f"os.environ.get('PORT') = {os.environ.get('PORT')}", flush=True)
print(f"os.environ.get('port') = {os.environ.get('port')}", flush=True)

# اقرأ PORT من البيئة - بدون قيمة افتراضية
# لو مش موجود في Railway: خطأ واضح في الـ Logs
port_env = os.environ.get("PORT")

if port_env is None:
    # لو مش على Railway - استخدم 8080 محلياً
    print("WARNING: PORT env var not found! Using 8080 for local dev.", flush=True)
    PORT = 8080
else:
    PORT = int(port_env)
    print(f"SUCCESS: PORT={PORT} read from environment.", flush=True)

print(f"=== BINDING TO 0.0.0.0:{PORT} ===", flush=True)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, format, *args):
        print(f"[HIT] {format % args}", flush=True)


socketserver.TCPServer.allow_reuse_address = True

try:
    with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"=== SERVER RUNNING ON 0.0.0.0:{PORT} ===", flush=True)
        httpd.serve_forever()
except Exception as e:
    print(f"FATAL ERROR: {e}", flush=True)
    sys.exit(1)
