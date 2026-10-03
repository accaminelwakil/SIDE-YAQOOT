import http.server
import socketserver
import socket
import os
import sys

# Ensure UTF-8 output on consoles
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = '0.0.0.0'
    finally:
        s.close()
    return ip

def find_free_port(preferred_port=5500, max_tries=50):
    for port in range(preferred_port, preferred_port + max_tries):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                s.bind(('', port))
                return port
        except OSError:
            continue
    return preferred_port

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        # Security headers for PWA
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'SAMEORIGIN')
        super().end_headers()

    def log_message(self, format, *args):
        # Suppress noisy request logs in production
        pass

if __name__ == '__main__':
    # ضمان أن مسار العمل هو مجلد منظومة عيادات سيدي ياقوت حصراً
    current_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(current_dir)

    # Railway (وأي منصة cloud) بتحدد البورت عبر متغير بيئي PORT
    # لو مش موجود (تشغيل محلي) هنستخدم 5500
    PORT = int(os.environ.get('PORT', 0))
    if PORT == 0:
        PORT = find_free_port(5500)
        is_local = True
    else:
        is_local = False

    # الـ HOST: على Railway نسمع على 0.0.0.0 - محلياً نسمع على localhost
    HOST = '0.0.0.0'
    local_ip = get_local_ip()

    print("=" * 72)
    print(" [عيادات سيدي ياقوت التخصصية] - خادم الشبكة والموبايل")
    print("=" * 72)
    print(f" المجلد: {current_dir}")
    print(f" وضع التشغيل: {'محلي (Local)' if is_local else 'سحابي (Railway/Cloud)'}")

    if is_local:
        print(f"\n [1] للفتح على هذا الكمبيوتر:")
        print(f"     http://localhost:{PORT}/index.html")
        print(f"\n [2] للفتح على أي موبايل أو تابلت على نفس شبكة الواي فاي:")
        print(f"     http://{local_ip}:{PORT}/index.html")
    else:
        print(f"\n [Railway] السيرفر شغال على البورت: {PORT}")
        print(f"     http://0.0.0.0:{PORT}/index.html")

    print("\n [Firebase Sync] المزامنة السحابية الحية نشطة ومفعلة تلقائياً")
    print("=" * 72)
    print(" (اضغط Ctrl+C للإيقاف)")
    print("=" * 72 + "\n")

    handler_factory = lambda *args, **kwargs: CustomHandler(*args, directory=current_dir, **kwargs)

    try:
        with socketserver.TCPServer((HOST, PORT), handler_factory) as httpd:
            httpd.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            print(f"Server running on {HOST}:{PORT} ...")

            # فتح المتصفح فقط في وضع التشغيل المحلي
            if is_local:
                try:
                    import webbrowser
                    webbrowser.open(f"http://localhost:{PORT}/index.html")
                except Exception:
                    pass

            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nتم إيقاف السيرفر بنجاح.")
    except Exception as e:
        print(f"\nحدث خطأ: {e}")
        if is_local:
            input("اضغط Enter للإغلاق...")
        sys.exit(1)

