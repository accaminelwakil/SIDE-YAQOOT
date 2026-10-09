from flask import Flask, send_from_directory
from functools import wraps
import os
import threading
import time
from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)
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
from flask import request, jsonify, g, abort

_firebase_admin = None
_firebase_db = None
_firebase_lock = threading.Lock()
_login_attempts = {}
_login_attempts_lock = threading.Lock()


def get_firebase_admin():
    global _firebase_admin, _firebase_db
    if _firebase_admin is not None:
        return _firebase_admin, _firebase_db

    with _firebase_lock:
        if _firebase_admin is not None:
            return _firebase_admin, _firebase_db
        import firebase_admin
        from firebase_admin import auth, credentials, firestore

        try:
            firebase_admin.get_app("sidi-yaqout-server")
        except ValueError:
            service_account_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
            if service_account_json:
                import json
                cred = credentials.Certificate(json.loads(service_account_json))
            else:
                cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred, name="sidi-yaqout-server")

        _firebase_admin = firebase_admin
        _firebase_db = firestore.client(firebase_admin.get_app("sidi-yaqout-server"))
    return _firebase_admin, _firebase_db


def require_firebase_auth(admin_only=False):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            auth_header = request.headers.get("Authorization", "")
            if not auth_header.startswith("Bearer "):
                return jsonify({"success": False, "message": "يلزم تسجيل الدخول."}), 401
            try:
                firebase_admin, _ = get_firebase_admin()
                g.auth_claims = firebase_admin.auth.verify_id_token(
                    auth_header[7:], app=firebase_admin.get_app("sidi-yaqout-server"), check_revoked=True
                )
            except Exception:
                app.logger.exception("Firebase ID token verification failed")
                return jsonify({"success": False, "message": "جلسة الدخول غير صالحة أو منتهية."}), 401
            if admin_only and g.auth_claims.get("role") != "admin":
                return jsonify({"success": False, "message": "هذه العملية متاحة لمدير النظام فقط."}), 403
            if g.auth_claims.get("passwordChangeRequired") and request.endpoint != "auth_change_password_api":
                return jsonify({"success": False, "message": "يجب تغيير كلمة المرور قبل استخدام المنظومة."}), 403
            return view(*args, **kwargs)
        return wrapped
    return decorator


def hash_password(password, salt=None):
    import base64
    import hashlib
    import secrets
    salt_bytes = base64.urlsafe_b64decode(salt) if salt else secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_bytes, 310000)
    return {
        "salt": base64.urlsafe_b64encode(salt_bytes).decode("ascii"),
        "hash": base64.urlsafe_b64encode(digest).decode("ascii"),
        "iterations": 310000
    }


def verify_password(password, credentials):
    import base64
    import hashlib
    import hmac
    try:
        salt = base64.urlsafe_b64decode(credentials["salt"])
        iterations = int(credentials.get("iterations", 310000))
        if not 100000 <= iterations <= 1000000:
            return False
        expected = base64.urlsafe_b64decode(credentials["hash"])
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
        return hmac.compare_digest(actual, expected)
    except (KeyError, TypeError, ValueError):
        return False


def normalized_username(username):
    return str(username or "").strip().lower()


def auth_user_key(username):
    import hashlib
    return hashlib.sha256(normalized_username(username).encode("utf-8")).hexdigest()


def revoke_auth_sessions(firebase_admin, username, disable=False):
    uid = auth_user_key(username)
    app_instance = firebase_admin.get_app("sidi-yaqout-server")
    try:
        firebase_admin.auth.get_user(uid, app=app_instance)
        if disable:
            firebase_admin.auth.update_user(uid, disabled=True, app=app_instance)
        firebase_admin.auth.revoke_refresh_tokens(uid, app=app_instance)
    except firebase_admin.auth.UserNotFoundError:
        pass


def user_profiles_document(db):
    return db.collection("sidi_yaqout_erp").document("users")


def public_user_profile(user):
    return {key: value for key, value in user.items() if key not in ("pin", "password", "passwordHash")}


def default_screen_access(role):
    if role == "accountant":
        edit_screens = {
            "screen-salary-adjustments", "screen-payroll-summary", "screen-single-sarki",
            "screen-bulk-payslips", "screen-payroll-delivery", "screen-backup-restore",
            "screen-firebase-settings", "screen-leaves-permissions", "screen-punches-payroll"
        }
        view_screens = {
            "screen-welcome", "screen-employees", "screen-attendance", "screen-emp-general-report",
            "screen-totals-report", "screen-attendance-comparison"
        }
        return {**{screen: "edit" for screen in edit_screens}, **{screen: "view" for screen in view_screens}}
    if role == "supervisor":
        return {
            "screen-attendance": "edit",
            "screen-welcome": "view",
            "screen-leaves-permissions": "edit"
        }
    if role == "employee":
        return {
            "screen-employee-sarki": "view",
            "screen-leaves-permissions": "edit"
        }
    return {"screen-welcome": "view", "screen-leaves-permissions": "edit"}


def record_login_failure(attempt_key, now):
    with _login_attempts_lock:
        attempts = [timestamp for timestamp in _login_attempts.get(attempt_key, []) if now - timestamp < 300]
        attempts.append(now)
        _login_attempts[attempt_key] = attempts


@app.route("/api/auth/login", methods=["POST"])
def auth_login_api():
    data = request.get_json(silent=True) or {}
    username = normalized_username(data.get("username"))
    password = str(data.get("password") or "")
    if not username or not password or len(username) > 100 or len(password) > 256:
        return jsonify({"success": False, "message": "اسم المستخدم أو كلمة المرور غير صحيحة."}), 400

    client_ip = request.remote_addr or "unknown"
    attempt_key = f"{client_ip}:{username}"
    now = time.time()
    with _login_attempts_lock:
        attempts = [timestamp for timestamp in _login_attempts.get(attempt_key, []) if now - timestamp < 300]
        if len(attempts) >= 10:
            return jsonify({"success": False, "message": "محاولات كثيرة. يرجى الانتظار خمس دقائق."}), 429

    try:
        firebase_admin, db = get_firebase_admin()
        snapshot = user_profiles_document(db).get()
        profiles = snapshot.to_dict() if snapshot.exists else {}
        users = profiles.get("list", [])
        user = next((entry for entry in users if isinstance(entry, dict) and normalized_username(entry.get("username")) == username), None)
        bootstrap_password = os.environ.get("FIREBASE_BOOTSTRAP_ADMIN_PASSWORD", "")
        if bootstrap_password and len(bootstrap_password) < 16:
            return jsonify({"success": False, "message": "كلمة مرور التهيئة يجب أن تكون 16 حرفاً على الأقل."}), 503
        if username == "admin" and bootstrap_password and hmac_compare(password, bootstrap_password):
            if not user:
                screen_ids = [
                    "screen-welcome", "screen-employees", "screen-attendance", "screen-salary-adjustments",
                    "screen-payroll-summary", "screen-single-sarki", "screen-bulk-payslips", "screen-payroll-delivery",
                    "screen-emp-general-report", "screen-totals-report", "screen-backup-restore", "screen-users-roles",
                    "screen-firebase-settings", "screen-employee-sarki", "screen-leaves-permissions",
                    "screen-punches-payroll", "screen-attendance-comparison"
                ]
                user = {
                    "username": "admin",
                    "fullName": "مدير النظام",
                    "role": "admin",
                    "permissions": screen_ids,
                    "screenAccess": {screen_id: "edit" for screen_id in screen_ids},
                    "hasChangedPassword": False,
                    "createdAt": datetime.datetime.now().strftime("%Y-%m-%d")
                }
                users.append(user)
                user_profiles_document(db).set({"list": users}, merge=True)
        if not user:
            record_login_failure(attempt_key, now)
            return jsonify({"success": False, "message": "اسم المستخدم أو كلمة المرور غير صحيحة."}), 401

        credential_ref = db.collection("sidi_yaqout_auth").document(auth_user_key(username))
        credential_snapshot = credential_ref.get()
        bootstrap_login = username == "admin" and bool(bootstrap_password) and hmac_compare(password, bootstrap_password) and not credential_snapshot.exists
        if bootstrap_login:
            valid_password = True
        elif credential_snapshot.exists:
            valid_password = verify_password(password, credential_snapshot.to_dict())
        elif username == "admin" and bootstrap_password:
            valid_password = False
        else:
            valid_password = hmac_compare(password, str(user.get("pin", "")))
        if not valid_password:
            record_login_failure(attempt_key, now)
            return jsonify({"success": False, "message": "اسم المستخدم أو كلمة المرور غير صحيحة."}), 401

        if not credential_snapshot.exists:
            credential_ref.set(hash_password(password))
        if any(isinstance(entry, dict) and "pin" in entry for entry in users):
            for legacy_user in users:
                if isinstance(legacy_user, dict) and legacy_user.get("pin"):
                    legacy_username = normalized_username(legacy_user.get("username"))
                    legacy_ref = db.collection("sidi_yaqout_auth").document(auth_user_key(legacy_username))
                    if not legacy_ref.get().exists:
                        legacy_ref.set(hash_password(str(legacy_user["pin"])))
                if isinstance(legacy_user, dict):
                    legacy_user["hasChangedPassword"] = False
            sanitized_users = [public_user_profile(entry) for entry in users if isinstance(entry, dict)]
            user_profiles_document(db).set({"list": sanitized_users}, merge=True)

        credential_data = credential_snapshot.to_dict() if credential_snapshot.exists else {}
        password_change_required = (
            bool(credential_data.get("passwordChangeRequired"))
            or not bool(user.get("hasChangedPassword", False))
        )

        uid = auth_user_key(username)
        try:
            auth_user = firebase_admin.auth.get_user(uid, app=firebase_admin.get_app("sidi-yaqout-server"))
            if auth_user.disabled:
                firebase_admin.auth.update_user(uid, disabled=False, app=firebase_admin.get_app("sidi-yaqout-server"))
        except firebase_admin.auth.UserNotFoundError:
            pass

        role = str(user.get("role", "employee"))
        configured_access = user.get("screenAccess", {})
        if not isinstance(configured_access, dict):
            configured_access = default_screen_access(role)
        elif not configured_access:
            configured_access = default_screen_access(role)
        screen_access = {
            str(screen_id): access
            for screen_id, access in configured_access.items()
            if str(screen_id).startswith("screen-") and access in ("view", "edit")
        }
        claims = {
            "username": username,
            "fullName": str(user.get("fullName") or user.get("username") or "")[:120],
            "role": role,
            "empId": str(user.get("empId", "")),
            "isManager": bool(user.get("isManager", False)),
            "passwordChangeRequired": password_change_required,
            "screenAccess": {} if role == "admin" else screen_access
        }
        custom_token = firebase_admin.auth.create_custom_token(
            auth_user_key(username), developer_claims=claims, app=firebase_admin.get_app("sidi-yaqout-server")
        )
        with _login_attempts_lock:
            _login_attempts.pop(attempt_key, None)
        return jsonify({
            "success": True,
            "token": custom_token.decode("utf-8"),
            "user": {
                **public_user_profile(user),
                "hasChangedPassword": not password_change_required
            }
        })
    except Exception:
        app.logger.exception("Firebase-backed login failed")
        return jsonify({"success": False, "message": "تعذر إتمام تسجيل الدخول. تحقق من إعدادات Firebase."}), 503


def hmac_compare(left, right):
    import hmac
    return hmac.compare_digest(left.encode("utf-8"), right.encode("utf-8"))


@app.route("/api/auth/password", methods=["POST"])
@require_firebase_auth()
def auth_change_password_api():
    data = request.get_json(silent=True) or {}
    username = normalized_username(g.auth_claims.get("username"))
    current_password = str(data.get("currentPassword") or "")
    new_password = str(data.get("newPassword") or "")
    if len(new_password) < 8 or len(new_password) > 256:
        return jsonify({"success": False, "message": "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل."}), 400
    try:
        _, db = get_firebase_admin()
        credential_ref = db.collection("sidi_yaqout_auth").document(auth_user_key(username))
        credential = credential_ref.get()
        if not credential.exists or not verify_password(current_password, credential.to_dict()):
            return jsonify({"success": False, "message": "كلمة المرور الحالية غير صحيحة."}), 403
        if g.auth_claims.get("passwordChangeRequired") and verify_password(new_password, credential.to_dict()):
            return jsonify({"success": False, "message": "يجب اختيار كلمة مرور مختلفة عن كلمة المرور المؤقتة."}), 400
        credential_data = hash_password(new_password)
        credential_data["passwordChangeRequired"] = False
        credential_ref.set(credential_data)
        firebase_admin, _ = get_firebase_admin()
        revoke_auth_sessions(firebase_admin, username)
        profiles_ref = user_profiles_document(db)
        profiles = profiles_ref.get().to_dict() or {}
        users = profiles.get("list", [])
        for user in users:
            if isinstance(user, dict) and normalized_username(user.get("username")) == username:
                user["hasChangedPassword"] = True
                break
        profiles_ref.set({"list": users}, merge=True)
        return jsonify({"success": True})
    except Exception:
        app.logger.exception("Password change failed")
        return jsonify({"success": False, "message": "تعذر تحديث كلمة المرور."}), 500


@app.route("/api/auth/users/reset-temporary-passwords", methods=["POST"])
@require_firebase_auth(admin_only=True)
def auth_reset_temporary_passwords_api():
    data = request.get_json(silent=True) or {}
    temporary_password = str(data.get("password") or "")
    if len(temporary_password) < 8 or len(temporary_password) > 256:
        return jsonify({"success": False, "message": "كلمة المرور المؤقتة يجب أن تكون 8 أحرف على الأقل."}), 400

    try:
        _, db = get_firebase_admin()
        profiles_ref = user_profiles_document(db)
        profiles = profiles_ref.get().to_dict() or {}
        users = profiles.get("list", [])
        if not isinstance(users, list):
            return jsonify({"success": False, "message": "قائمة المستخدمين غير صالحة."}), 500

        target_usernames = []
        seen_usernames = set()
        for user in users:
            if not isinstance(user, dict):
                continue
            username = normalized_username(user.get("username"))
            if not username or username == "admin" or username in seen_usernames:
                continue
            seen_usernames.add(username)
            user["hasChangedPassword"] = False
            target_usernames.append(username)

        if len(target_usernames) > 499:
            return jsonify({"success": False, "message": "عدد الحسابات يتجاوز الحد المسموح لعملية التصفير الواحدة."}), 413
        if not target_usernames:
            return jsonify({"success": False, "message": "لا توجد حسابات موظفين لإعادة تعيينها."}), 404

        batch = db.batch()
        for username in target_usernames:
            credential = hash_password(temporary_password)
            credential["passwordChangeRequired"] = True
            batch.set(db.collection("sidi_yaqout_auth").document(auth_user_key(username)), credential)
        batch.set(profiles_ref, {"list": users}, merge=True)
        batch.commit()

        failed_revocations = []
        firebase_admin, _ = get_firebase_admin()
        for username in target_usernames:
            try:
                revoke_auth_sessions(firebase_admin, username)
            except Exception:
                app.logger.exception("Could not revoke sessions after temporary password reset for %s", username)
                failed_revocations.append(username)
        if failed_revocations:
            return jsonify({
                "success": False,
                "resetCount": len(target_usernames),
                "failedRevocations": failed_revocations,
                "message": "تم تغيير كلمات المرور، لكن تعذر إنهاء بعض الجلسات السابقة. راجع سجلات الخادم فوراً."
            }), 503

        return jsonify({"success": True, "resetCount": len(target_usernames), "excludedUsername": "admin"})
    except Exception:
        app.logger.exception("Resetting employee temporary passwords failed")
        return jsonify({"success": False, "message": "تعذر إعادة تعيين كلمات مرور الموظفين."}), 500


@app.route("/api/auth/users", methods=["POST"])
@require_firebase_auth(admin_only=True)
def auth_create_user_api():
    data = request.get_json(silent=True) or {}
    user = data.get("user")
    password = str(data.get("password") or "")
    if not isinstance(user, dict) or not normalized_username(user.get("username")) or len(password) < 8:
        return jsonify({"success": False, "message": "بيانات المستخدم أو كلمة المرور غير صالحة."}), 400
    username = normalized_username(user["username"])
    try:
        _, db = get_firebase_admin()
        profiles_ref = user_profiles_document(db)
        current = profiles_ref.get().to_dict() or {}
        users = current.get("list", [])
        if any(normalized_username(entry.get("username")) == username for entry in users if isinstance(entry, dict)):
            return jsonify({"success": False, "message": "اسم المستخدم مستخدم بالفعل."}), 409
        clean_user = public_user_profile(user)
        clean_user["username"] = username
        clean_user["hasChangedPassword"] = False
        users.append(clean_user)
        profiles_ref.set({"list": users}, merge=True)
        db.collection("sidi_yaqout_auth").document(auth_user_key(username)).set(hash_password(password))
        return jsonify({"success": True, "user": clean_user}), 201
    except Exception:
        app.logger.exception("Creating user failed")
        return jsonify({"success": False, "message": "تعذر إنشاء المستخدم."}), 500


@app.route("/api/auth/users/<username>", methods=["PUT", "DELETE"])
@require_firebase_auth(admin_only=True)
def auth_manage_user_api(username):
    username = normalized_username(username)
    try:
        _, db = get_firebase_admin()
        profiles_ref = user_profiles_document(db)
        current = profiles_ref.get().to_dict() or {}
        users = current.get("list", [])
        target = next((entry for entry in users if isinstance(entry, dict) and normalized_username(entry.get("username")) == username), None)
        if not target:
            return jsonify({"success": False, "message": "المستخدم غير موجود."}), 404
        credential_ref = db.collection("sidi_yaqout_auth").document(auth_user_key(username))

        if request.method == "DELETE":
            if username == "admin":
                return jsonify({"success": False, "message": "لا يمكن حذف حساب المدير الأساسي."}), 400
            users = [entry for entry in users if normalized_username(entry.get("username")) != username]
            profiles_ref.set({"list": users}, merge=True)
            firebase_admin, _ = get_firebase_admin()
            revoke_auth_sessions(firebase_admin, username, disable=True)
            credential_ref.delete()
            return jsonify({"success": True})

        data = request.get_json(silent=True) or {}
        user = data.get("user")
        password = str(data.get("password") or "")
        if not isinstance(user, dict):
            return jsonify({"success": False, "message": "بيانات المستخدم غير صالحة."}), 400
        if password and (len(password) < 8 or len(password) > 256):
            return jsonify({"success": False, "message": "كلمة المرور يجب أن تكون 8 أحرف على الأقل."}), 400
        clean_user = public_user_profile(user)
        clean_user["username"] = username
        if password:
            clean_user["hasChangedPassword"] = False
        users = [clean_user if normalized_username(entry.get("username")) == username else entry for entry in users]
        profiles_ref.set({"list": users}, merge=True)
        if password:
            credential_ref.set(hash_password(password))
        firebase_admin, _ = get_firebase_admin()
        revoke_auth_sessions(firebase_admin, username)
        return jsonify({"success": True, "user": clean_user})
    except Exception:
        app.logger.exception("Updating user failed")
        return jsonify({"success": False, "message": "تعذر تحديث المستخدم."}), 500

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
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error saving geofence config: {e}")


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
    try:
        punches = load_punches()
        punches.insert(0, punch_record)
        if len(punches) > 500:
            punches = punches[:500]
        with open(PUNCHES_FILE, "w", encoding="utf-8") as f:
            json.dump(punches, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error saving punch: {e}")


@app.route("/api/geofence/config", methods=["GET", "POST"])
@require_firebase_auth()
def geofence_config_api():
    if request.method == "POST":
        if g.auth_claims.get("role") != "admin":
            return jsonify({"success": False, "message": "هذه العملية متاحة لمدير النظام فقط."}), 403
        data = request.get_json(silent=True) or {}
        cfg = load_geofence_config()
        try:
            if "latitude" in data:
                cfg["latitude"] = float(data["latitude"])
            if "longitude" in data:
                cfg["longitude"] = float(data["longitude"])
            if "radius_meters" in data:
                cfg["radius_meters"] = float(data["radius_meters"])
            if not (-90 <= cfg["latitude"] <= 90 and -180 <= cfg["longitude"] <= 180):
                raise ValueError("Coordinates are outside valid ranges")
            if not (1 <= cfg["radius_meters"] <= 100000):
                raise ValueError("Radius is outside valid range")
        except (TypeError, ValueError):
            return jsonify({"success": False, "message": "إعدادات الموقع الجغرافي غير صالحة."}), 400
        if "workplace_name" in data:
            cfg["workplace_name"] = str(data["workplace_name"]).strip()[:120]
        if "enabled" in data:
            if not isinstance(data["enabled"], bool):
                return jsonify({"success": False, "message": "قيمة تفعيل النطاق الجغرافي غير صالحة."}), 400
            cfg["enabled"] = data["enabled"]
        save_geofence_config(cfg)
        return jsonify({"success": True, "config": cfg, "message": "تم حفظ إعدادات الموقع الجغرافي بنجاح"})
    else:
        return jsonify(load_geofence_config())


@app.route("/api/attendance/check-in", methods=["POST"])
@require_firebase_auth()
def attendance_check_in_api():
    data = request.get_json(silent=True) or {}
    emp_id = str(g.auth_claims.get("empId") or "").strip()
    emp_name = str(g.auth_claims.get("fullName") or g.auth_claims.get("username") or "موظف").strip()
    if not emp_id and g.auth_claims.get("role") == "admin":
        emp_id = str(data.get("empId", "")).strip()[:100]
        emp_name = str(data.get("empName", "موظف")).strip()[:120]
    if not emp_id:
        return jsonify({"success": False, "message": "حساب المستخدم غير مرتبط برقم موظف."}), 403
    punch_type = str(data.get("type", "in")).strip().lower()  # 'in' or 'out'
    if punch_type not in ("in", "out"):
        return jsonify({"success": False, "message": "نوع حركة الحضور غير صالح."}), 400
    punch_title = "حضور" if punch_type == "in" else "انصراف"

    try:
        user_lat = float(data.get("latitude"))
        user_lon = float(data.get("longitude"))
        accuracy = float(data.get("accuracy", 0))
        if not (-90 <= user_lat <= 90 and -180 <= user_lon <= 180 and 0 <= accuracy <= 100000):
            raise ValueError("Invalid location data")
    except (TypeError, ValueError):
        return jsonify({
            "success": False,
            "status": "ERROR_INVALID_COORDS",
            "message": "إحداثيات الموقع غير صحيحة أو مفقودة!"
        }), 400

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
@require_firebase_auth()
def attendance_punches_api():
    punches = load_punches()
    if g.auth_claims.get("role") == "employee":
        employee_id = str(g.auth_claims.get("empId") or "")
        punches = [punch for punch in punches if employee_id and str(punch.get("empId", "")) == employee_id]
    return jsonify({
        "success": True,
        "punches": punches
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


def notifications_for_current_user(notifications):
    claims = g.auth_claims
    if claims.get("role") == "admin":
        return notifications
    username = normalized_username(claims.get("username"))
    employee_id = str(claims.get("empId") or "")
    role = str(claims.get("role") or "")
    is_manager = bool(claims.get("isManager"))
    visible = []
    for notification in notifications:
        if not isinstance(notification, dict):
            continue
        target_username = normalized_username(notification.get("targetUsername"))
        target_role = str(notification.get("targetRole") or "")
        target_emp_id = str(notification.get("targetEmpId") or "")
        if not target_username and not target_role and not target_emp_id:
            visible.append(notification)
        elif target_username and target_username == username:
            visible.append(notification)
        elif target_emp_id and employee_id and target_emp_id == employee_id:
            visible.append(notification)
        elif target_role == role or (target_role == "manager" and is_manager):
            visible.append(notification)
    return visible


@app.route("/api/notifications/sync", methods=["GET", "POST"])
@require_firebase_auth()
def notifications_sync_api():
    """مزامنة فورية للإشعارات بين أجهزة الكمبيوتر والموبايل المتصلة بالمنظومة"""
    current_notifs = load_server_notifications()
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        incoming = data.get("notifications", [])
        if isinstance(incoming, list) and len(incoming) <= 100:
            current_map = {n["id"]: n for n in current_notifs if isinstance(n, dict) and "id" in n}
            for n in incoming:
                if isinstance(n, dict) and isinstance(n.get("id"), str) and len(n["id"]) <= 150:
                    nid = n["id"]
                    if nid not in current_map:
                        safe_notification = {"id": nid}
                        for key in ("title", "message", "type", "createdAt", "targetUsername", "targetRole",
                                    "targetEmpId", "senderName", "actionScreen"):
                            if key in n:
                                safe_notification[key] = str(n[key])[:2000]
                        safe_notification["isRead"] = n.get("isRead") is True
                        current_map[nid] = safe_notification
                    else:
                        # تحديث حالة القراءة إن كانت مقروءة في الجهاز الوارد
                        if n.get("isRead") and not current_map[nid].get("isRead"):
                            current_map[nid]["isRead"] = True
            
            merged = list(current_map.values())
            # ترتيب تنازلياً حسب وقت الإنشاء
            merged.sort(key=lambda x: str(x.get("createdAt", "")), reverse=True)
            merged = merged[:300]
            save_server_notifications(merged)
            return jsonify({"success": True, "notifications": notifications_for_current_user(merged)})
        return jsonify({"success": False, "message": "Invalid format"}), 400
    else:
        return jsonify({"success": True, "notifications": notifications_for_current_user(current_notifs)})


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
@require_firebase_auth(admin_only=True)
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
@require_firebase_auth(admin_only=True)
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
@require_firebase_auth(admin_only=True)
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
    normalized_path = path.replace("\\", "/").strip("/")
    blocked_names = {
        "backups",
        "attendance_punches.json",
        "geofence_config.json",
        "notifications_store.json"
    }
    path_parts = normalized_path.split("/")
    if any(part.startswith(".") or part == "__pycache__" for part in path_parts):
        abort(404)
    if path_parts[0] in blocked_names:
        abort(404)
    return send_from_directory(BASE_DIR, path)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
