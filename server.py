import http.server
import socketserver
import socket
import webbrowser
import os
import sys

# Ensure UTF-8 output on Windows consoles
if sys.platform == 'win32':
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
        ip = '127.0.0.1'
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
        super().end_headers()

if __name__ == '__main__':
    # ضمان أن مسار العمل هو مجلد منظومة عيادات سيدي ياقوت حصراً
    current_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(current_dir)

    PORT = find_free_port(5500)
    local_ip = get_local_ip()

    print("=" * 72)
    print(" [عيادات سيدي ياقوت التخصصية] - خادم الشبكة والموبايل")
    print("=" * 72)
    print(f" المجلد: {current_dir}")
    print(f"\n [1] للفتح على هذا الكمبيوتر:")
    print(f"     http://localhost:{PORT}/index.html")
    print(f"\n [2] للفتح على أي موبايل أو تابلت على نفس شبكة الواي فاي:")
    print(f"     http://{local_ip}:{PORT}/index.html")
    print("\n [3] المزامنة السحابية الحية (Live Firebase Sync) نشطة ومفعلة تلقائياً")
    print("=" * 72)
    print(" (اترك هذه النافذة مفتوحة أثناء استخدام المنظومة - اضغط Ctrl+C للإيقاف)")
    print("=" * 72 + "\n")

    # تهيئة الخادم وربطه بالمنفذ الخاص بالمنظومة
    handler_factory = lambda *args, **kwargs: CustomHandler(*args, directory=current_dir, **kwargs)
    
    try:
        with socketserver.TCPServer(("", PORT), handler_factory) as httpd:
            # فتح المتصفح فقط بعد نجاح إنشاء الخادم
            webbrowser.open(f"http://localhost:{PORT}/index.html")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nتم إيقاف السيرفر بنجاح.")
    except Exception as e:
        print(f"\nحدث خطأ: {e}")
        input("اضغط Enter للإغلاق...")
