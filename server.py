import http.server
import socketserver
import os

# ================================================================
# Railway بيبعت رقم البورت عبر متغير بيئي اسمه PORT
# الكود ده بيقرأه ويحوله لـ integer
# لو مش موجود (تشغيل محلي) يرجع 8080
# ================================================================
PORT = int(os.environ.get("PORT", 8080))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# طباعة مبكرة جداً علشان نتأكد من Railway Logs
print(f">>> PORT from env = {os.environ.get('PORT', 'NOT SET')}", flush=True)
print(f">>> Using PORT    = {PORT}", flush=True)
print(f">>> BASE_DIR      = {BASE_DIR}", flush=True)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, format, *args):
        print(f"[REQUEST] {format % args}", flush=True)


socketserver.TCPServer.allow_reuse_address = True

print(f">>> Starting server on 0.0.0.0:{PORT} ...", flush=True)

with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    print(f">>> Server is UP on port {PORT}", flush=True)
    httpd.serve_forever()
