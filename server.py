import http.server
import socketserver
import socket
import os
import sys

# ====================================================================
# عيادات سيدي ياقوت - خادم الويب (يعمل محلياً وعلى Railway)
# ====================================================================

# Ensure UTF-8 output
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass


class CustomHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP Handler with CORS and security headers"""

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def log_message(self, format, *args):
        # اطبع الـ logs في production علشان نشوف المشاكل
        print(f"[{self.address_string()}] {format % args}", flush=True)


class ReusableTCPServer(socketserver.TCPServer):
    """TCPServer مع SO_REUSEADDR قبل الـ bind"""
    allow_reuse_address = True  # ده بيضبط SO_REUSEADDR قبل bind تلقائياً


if __name__ == '__main__':
    # مسار مجلد التطبيق
    current_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(current_dir)

    # ================================================================
    # PORT: Railway بتحدده عبر environment variable
    # لو مش موجود (تشغيل محلي) نستخدم 8080
    # ================================================================
    PORT = int(os.environ.get('PORT', 8080))
    HOST = '0.0.0.0'  # لازم 0.0.0.0 دايماً علشان Railway يعرف يوصل

    is_local = os.environ.get('RAILWAY_ENVIRONMENT') is None

    print("=" * 60, flush=True)
    print(" [عيادات سيدي ياقوت التخصصية]", flush=True)
    print("=" * 60, flush=True)
    print(f" Directory : {current_dir}", flush=True)
    print(f" Mode      : {'Local' if is_local else 'Railway/Cloud'}", flush=True)
    print(f" Host      : {HOST}", flush=True)
    print(f" Port      : {PORT}", flush=True)
    print("=" * 60, flush=True)

    handler_factory = lambda *args, **kwargs: CustomHandler(
        *args, directory=current_dir, **kwargs
    )

    try:
        with ReusableTCPServer((HOST, PORT), handler_factory) as httpd:
            print(f"✓ Server started → http://{HOST}:{PORT}/index.html", flush=True)

            # فتح المتصفح فقط عند التشغيل المحلي
            if is_local:
                try:
                    import webbrowser
                    webbrowser.open(f"http://localhost:{PORT}/index.html")
                except Exception:
                    pass

            httpd.serve_forever()

    except KeyboardInterrupt:
        print("\n✓ Server stopped.", flush=True)
    except OSError as e:
        print(f"\n✗ OS Error (port {PORT} busy?): {e}", flush=True)
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Error: {e}", flush=True)
        sys.exit(1)
