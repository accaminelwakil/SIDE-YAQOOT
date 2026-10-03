import http.server
import socketserver
import os
import sys

# ── PORT ─────────────────────────────────────────────────────────────
# Railway بيحدد البورت عبر متغير بيئي PORT
# لو مش موجود (تشغيل محلي) نستخدم 8080
PORT = int(os.environ.get("PORT", 8080))

# ── DIRECTORY ────────────────────────────────────────────────────────
# مجلد الملفات الثابتة (نفس مجلد server.py)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ── HANDLER ──────────────────────────────────────────────────────────
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

# ── SERVER ───────────────────────────────────────────────────────────
socketserver.TCPServer.allow_reuse_address = True

with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    print(f"Server running on port {PORT}", flush=True)
    httpd.serve_forever()
