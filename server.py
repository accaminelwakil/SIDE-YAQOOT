from flask import Flask, send_from_directory
import os

app = Flask(__name__)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


# ── ترويسات الأمان الخاصة بالـ PWA والـ Mobile Apps ─────────────────
@app.after_request
def add_pwa_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(self)"
    return response


# ── Manifest: يحتاج MIME type خاص للـ PWABuilder ────────────────────
@app.route("/manifest.json")
def manifest():
    resp = send_from_directory(BASE_DIR, "manifest.json")
    resp.headers["Content-Type"] = "application/manifest+json; charset=utf-8"
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


# ── Digital Asset Links (TWA / Android APK & AAB) ───────────────────
@app.route("/.well-known/assetlinks.json")
def assetlinks():
    dir_to_use = os.path.join(BASE_DIR, ".well-known") if os.path.exists(os.path.join(BASE_DIR, ".well-known", "assetlinks.json")) else os.path.join(BASE_DIR, "static", ".well-known")
    resp = send_from_directory(dir_to_use, "assetlinks.json")
    resp.headers["Content-Type"] = "application/json; charset=utf-8"
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


# ── Service Worker: يجب أن يكون في الجذر تماماً ──────────────────────
@app.route("/sw.js")
def service_worker():
    resp = send_from_directory(BASE_DIR, "sw.js")
    resp.headers["Content-Type"] = "application/javascript; charset=utf-8"
    resp.headers["Service-Worker-Allowed"] = "/"
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return resp


# ── الصفحة الرئيسية ──────────────────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


# ── إعدادات وتوابع الموقع الجغرافي (Geofencing Backend) ─────────────
import json
import math
import datetime
from flask import request, jsonify

CONFIG_FILE = os.path.join(BASE_DIR, "geofence_config.json")
PUNCHES_FILE = os.path.join(BASE_DIR, "attendance_punches.json")

DEFAULT_GEOFENCE_CONFIG = {
    "latitude": 31.2001,
    "longitude": 29.9187,
    "radius_meters": 50.0,
    "workplace_name": "مقر عيادات سيدي ياقوت التخصصية",
    "enabled": True
}


def load_geofence_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return DEFAULT_GEOFENCE_CONFIG.copy()


def save_geofence_config(cfg):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


def calculate_haversine_distance(lat1, lon1, lat2, lon2):
    """حساب المسافة الدقيقة بين نقطتين بالمتر باستخدام قانون هافرسين"""
    R = 6371000.0  # نصف قطر الأرض بالمتر
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def load_punches():
    if os.path.exists(PUNCHES_FILE):
        try:
            with open(PUNCHES_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return []


def save_punch(punch_record):
    punches = load_punches()
    punches.insert(0, punch_record)
    if len(punches) > 500:
        punches = punches[:500]
    with open(PUNCHES_FILE, "w", encoding="utf-8") as f:
        json.dump(punches, f, ensure_ascii=False, indent=2)


@app.route("/api/geofence/config", methods=["GET", "POST"])
def geofence_config_api():
    if request.method == "POST":
        data = request.get_json(force=True, silent=True) or {}
        cfg = load_geofence_config()
        if "latitude" in data:
            cfg["latitude"] = float(data["latitude"])
        if "longitude" in data:
            cfg["longitude"] = float(data["longitude"])
        if "radius_meters" in data:
            cfg["radius_meters"] = float(data["radius_meters"])
        if "workplace_name" in data:
            cfg["workplace_name"] = str(data["workplace_name"]).strip()
        if "enabled" in data:
            cfg["enabled"] = bool(data["enabled"])
        save_geofence_config(cfg)
        return jsonify({"success": True, "config": cfg, "message": "تم حفظ إعدادات الموقع الجغرافي بنجاح"})
    else:
        return jsonify(load_geofence_config())


@app.route("/api/attendance/check-in", methods=["POST"])
def attendance_check_in_api():
    data = request.get_json(force=True, silent=True) or {}
    emp_id = str(data.get("empId", "")).strip()
    emp_name = str(data.get("empName", "موظف")).strip()
    punch_type = str(data.get("type", "in")).strip().lower()  # 'in' or 'out'
    punch_title = "حضور" if punch_type == "in" else "انصراف"

    try:
        user_lat = float(data.get("latitude"))
        user_lon = float(data.get("longitude"))
    except (TypeError, ValueError):
        return jsonify({
            "success": False,
            "status": "ERROR_INVALID_COORDS",
            "message": "إحداثيات الموقع غير صحيحة أو مفقودة!"
        }), 400

    accuracy = float(data.get("accuracy", 0))
    cfg = load_geofence_config()
    work_lat = float(cfg.get("latitude", 31.2001))
    work_lon = float(cfg.get("longitude", 29.9187))
    allowed_radius = float(cfg.get("radius_meters", 50.0))
    is_enabled = bool(cfg.get("enabled", True))

    distance = calculate_haversine_distance(work_lat, work_lon, user_lat, user_lon)
    is_accepted = (distance <= allowed_radius) if is_enabled else True

    now = datetime.datetime.now()
    punch_record = {
        "id": f"punch_{int(now.timestamp() * 1000)}",
        "empId": emp_id,
        "empName": emp_name,
        "type": punch_type,
        "typeTitle": punch_title,
        "latitude": round(user_lat, 6),
        "longitude": round(user_lon, 6),
        "accuracy": round(accuracy, 1),
        "distance_meters": round(distance, 1),
        "allowed_radius": allowed_radius,
        "status": "ACCEPTED" if is_accepted else "REJECTED_OUT_OF_RANGE",
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M:%S"),
        "timestamp": now.isoformat()
    }
    save_punch(punch_record)

    if is_accepted:
        return jsonify({
            "success": True,
            "status": "ACCEPTED",
            "distance_meters": round(distance, 1),
            "allowed_radius": allowed_radius,
            "message": f"تم تسجيل {punch_title} بنجاح! أنت داخل مقر العمل (المسافة: {round(distance, 1)} متر).",
            "punch": punch_record
        }), 200
    else:
        return jsonify({
            "success": False,
            "status": "REJECTED_OUT_OF_RANGE",
            "distance_meters": round(distance, 1),
            "allowed_radius": allowed_radius,
            "message": f"عذراً! تم رفض تسجيل {punch_title} لأنك خارج مقر العمل. المسافة الحالية: {round(distance, 1)} متر (الحد الأقصى المسموح به: {allowed_radius} متر فقط)."
        }), 403


@app.route("/api/attendance/punches", methods=["GET"])
def attendance_punches_api():
    return jsonify({
        "success": True,
        "punches": load_punches()
    })


# ── مركز مزامنة الإشعارات بين الموبايل والديسكتوب (Notifications Sync API) ──
NOTIFICATIONS_FILE = os.path.join(BASE_DIR, "notifications_store.json")


def load_server_notifications():
    if os.path.exists(NOTIFICATIONS_FILE):
        try:
            with open(NOTIFICATIONS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return []


def save_server_notifications(notifs):
    try:
        with open(NOTIFICATIONS_FILE, "w", encoding="utf-8") as f:
            json.dump(notifs[:300], f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error saving server notifications: {e}")


@app.route("/api/notifications/sync", methods=["GET", "POST"])
def notifications_sync_api():
    """مزامنة فورية للإشعارات بين أجهزة الكمبيوتر والموبايل المتصلة بالمنظومة"""
    current_notifs = load_server_notifications()
    if request.method == "POST":
        data = request.get_json(force=True, silent=True) or {}
        incoming = data.get("notifications", [])
        if isinstance(incoming, list):
            current_map = {n["id"]: n for n in current_notifs if isinstance(n, dict) and "id" in n}
            for n in incoming:
                if isinstance(n, dict) and "id" in n:
                    nid = n["id"]
                    if nid not in current_map:
                        current_map[nid] = n
                    else:
                        # تحديث حالة القراءة إن كانت مقروءة في الجهاز الوارد
                        if n.get("isRead") and not current_map[nid].get("isRead"):
                            current_map[nid]["isRead"] = True
            
            merged = list(current_map.values())
            # ترتيب تنازلياً حسب وقت الإنشاء
            merged.sort(key=lambda x: str(x.get("createdAt", "")), reverse=True)
            merged = merged[:300]
            save_server_notifications(merged)
            return jsonify({"success": True, "notifications": merged})
        return jsonify({"success": False, "message": "Invalid format"}), 400
    else:
        return jsonify({"success": True, "notifications": current_notifs})


# ── النسخ الاحتياطي التلقائي واسترجاع البيانات (Server Backup System) ──
BACKUPS_DIR = os.path.join(BASE_DIR, "backups")
LATEST_BACKUP_FILE = os.path.join(BACKUPS_DIR, "latest_backup.json")


def ensure_backups_dir():
    if not os.path.exists(BACKUPS_DIR):
        try:
            os.makedirs(BACKUPS_DIR, exist_ok=True)
        except Exception:
            pass


@app.route("/api/backup/save", methods=["POST"])
def save_server_backup_api():
    """حفظ نسخة احتياطية من بيانات المنظومة على السيرفر مع الاحتفاظ بآخر نسخة"""
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({"success": False, "message": "لا توجد بيانات صالحة للحفظ!"}), 400

        ensure_backups_dir()
        now = datetime.datetime.now()
        timestamp_str = now.strftime("%Y%m%d_%H%M%S")
        filename = f"backup_{timestamp_str}.json"
        filepath = os.path.join(BACKUPS_DIR, filename)

        # حفظ الملف المؤرخ
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        # حفظ أو تحديث ملف آخر نسخة
        with open(LATEST_BACKUP_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        # الاحتفاظ بآخر 30 نسخة وحذف القديم لتوفير المساحة
        try:
            all_backups = sorted(
                [f for f in os.listdir(BACKUPS_DIR) if f.startswith("backup_") and f.endswith(".json")],
                reverse=True
            )
            for old_f in all_backups[30:]:
                os.remove(os.path.join(BACKUPS_DIR, old_f))
        except Exception:
            pass

        return jsonify({
            "success": True,
            "filename": filename,
            "timestamp": now.strftime("%Y-%m-%d %H:%M:%S"),
            "message": "تم حفظ النسخة الاحتياطية بنجاح على السيرفر! 💾"
        }), 200
    except Exception as e:
        return jsonify({"success": False, "message": f"حدث خطأ أثناء حفظ النسخة: {str(e)}"}), 500


@app.route("/api/backup/latest", methods=["GET"])
def get_latest_server_backup_api():
    """استرجاع أحدث نسخة احتياطية محفوظة على السيرفر"""
    ensure_backups_dir()
    if not os.path.exists(LATEST_BACKUP_FILE):
        return jsonify({
            "success": False,
            "message": "لا توجد أي نسخ احتياطية محفوظة على السيرفر حتى الآن."
        }), 404

    try:
        with open(LATEST_BACKUP_FILE, "r", encoding="utf-8") as f:
            backup_data = json.load(f)

        mtime = os.path.getmtime(LATEST_BACKUP_FILE)
        mod_date = datetime.datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")

        return jsonify({
            "success": True,
            "lastModified": mod_date,
            "backup": backup_data,
            "message": f"تم جلب آخر نسخة احتياطية بنجاح (تاريخ: {mod_date})"
        }), 200
    except Exception as e:
        return jsonify({"success": False, "message": f"تعذر قراءة النسخة الاحتياطية: {str(e)}"}), 500


@app.route("/api/backup/list", methods=["GET"])
def list_server_backups_api():
    """عرض قائمة النسخ الاحتياطية المتاحة على السيرفر"""
    ensure_backups_dir()
    backups = []
    try:
        for fname in sorted(os.listdir(BACKUPS_DIR), reverse=True):
            if fname.startswith("backup_") and fname.endswith(".json"):
                fpath = os.path.join(BACKUPS_DIR, fname)
                mtime = os.path.getmtime(fpath)
                size_kb = round(os.path.getsize(fpath) / 1024, 1)
                backups.append({
                    "filename": fname,
                    "date": datetime.datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S"),
                    "sizeKb": size_kb
                })
    except Exception:
        pass
    return jsonify({"success": True, "backups": backups})



# ── كل الملفات الثابتة (CSS, JS, assets, ...) ───────────────────────
@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(BASE_DIR, path)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=False)
