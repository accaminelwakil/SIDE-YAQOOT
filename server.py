from flask import Flask, send_from_directory
from functools import wraps
import os
import copy
import threading
import time
import uuid
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
import base64
import glob
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
RAILWAY_VOLUME_MOUNT_PATH = os.environ.get("RAILWAY_VOLUME_MOUNT_PATH")
PUNCHES_DATA_DIR = RAILWAY_VOLUME_MOUNT_PATH or BASE_DIR
PUNCHES_LOG_FILE = os.path.join(PUNCHES_DATA_DIR, "attendance_punches.jsonl")
PUNCHES_PARTITION_DIR = os.path.join(PUNCHES_DATA_DIR, "punches_by_month")
PUNCHES_LOCK = threading.Lock()
LEAVES_PERMISSIONS_PATH = ("sidi_yaqout_erp", "leavesPermissions")

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
    punches = []
    with PUNCHES_LOCK:
        if os.path.exists(PUNCHES_FILE):
            with open(PUNCHES_FILE, "r", encoding="utf-8") as f:
                legacy_punches = json.load(f)
            if not isinstance(legacy_punches, list) or any(not isinstance(item, dict) for item in legacy_punches):
                raise ValueError("Legacy attendance punch file has an invalid format")
            punches.extend(legacy_punches)

        if os.path.exists(PUNCHES_LOG_FILE):
            with open(PUNCHES_LOG_FILE, "r", encoding="utf-8") as f:
                for line_number, line in enumerate(f, start=1):
                    if not line.strip():
                        continue
                    try:
                        punch = json.loads(line)
                    except json.JSONDecodeError as exc:
                        raise ValueError(f"Invalid punch log entry at line {line_number}") from exc
                    if not isinstance(punch, dict):
                        raise ValueError(f"Invalid punch log entry at line {line_number}")
                    punches.append(punch)
        for file_path in sorted(glob.glob(os.path.join(PUNCHES_PARTITION_DIR, "*.jsonl"))):
            punches.extend(read_punch_jsonl(file_path))

    return sorted(
        punches,
        key=lambda punch: str(punch.get("timestamp") or f"{punch.get('date', '')}T{punch.get('time', '')}"),
        reverse=True
    )


def save_punch(punch_record):
    punch_date = str(punch_record.get("date") or "")
    if not valid_iso_date(punch_date):
        raise ValueError("Attendance punch has an invalid date")
    os.makedirs(PUNCHES_PARTITION_DIR, exist_ok=True)
    serialized = json.dumps(punch_record, ensure_ascii=False, separators=(",", ":"))
    with PUNCHES_LOCK:
        path = os.path.join(PUNCHES_PARTITION_DIR, f"{punch_date[:7]}.jsonl")
        with open(path, "a", encoding="utf-8") as f:
            f.write(serialized + "\n")
            f.flush()
            os.fsync(f.fileno())


def read_punch_jsonl(file_path):
    punches = []
    with open(file_path, "r", encoding="utf-8") as file:
        for line_number, line in enumerate(file, start=1):
            if not line.strip():
                continue
            try:
                punch = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid punch log entry in {os.path.basename(file_path)} at line {line_number}") from exc
            if not isinstance(punch, dict):
                raise ValueError(f"Invalid punch log entry in {os.path.basename(file_path)} at line {line_number}")
            punches.append(punch)
    return punches


def punch_date(punch):
    value = str(punch.get("date") or (str(punch.get("timestamp") or "")[:10]))
    return value if valid_iso_date(value) else ""


def punch_months_between(start_date, end_date):
    current = datetime.date.fromisoformat(start_date).replace(day=1)
    last = datetime.date.fromisoformat(end_date).replace(day=1)
    months = []
    while current <= last:
        months.append(current.strftime("%Y-%m"))
        if current.month == 12:
            current = current.replace(year=current.year + 1, month=1)
        else:
            current = current.replace(month=current.month + 1)
    return months


def encode_punch_cursor(punch):
    key = [
        str(punch.get("timestamp") or f"{punch_date(punch)}T{punch.get('time', '')}"),
        str(punch.get("id") or "")
    ]
    return base64.urlsafe_b64encode(json.dumps(key, separators=(",", ":")).encode("utf-8")).decode("ascii")


def decode_punch_cursor(cursor):
    if not cursor:
        return None
    try:
        value = json.loads(base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8"))
        if not isinstance(value, list) or len(value) != 2 or not all(isinstance(item, str) for item in value):
            raise ValueError
        return tuple(value)
    except (ValueError, UnicodeError, json.JSONDecodeError):
        raise ValueError("Invalid attendance punch cursor")


def load_punches_page(start_date=None, end_date=None, limit=200, cursor=None, employee_id=None):
    if bool(start_date) != bool(end_date):
        raise ValueError("Both startDate and endDate are required")
    if start_date and (not valid_iso_date(start_date) or not valid_iso_date(end_date) or end_date < start_date):
        raise ValueError("Invalid attendance punch date range")

    after = decode_punch_cursor(cursor)
    punches = []
    with PUNCHES_LOCK:
        if os.path.exists(PUNCHES_FILE):
            with open(PUNCHES_FILE, "r", encoding="utf-8") as file:
                legacy_punches = json.load(file)
            if not isinstance(legacy_punches, list) or any(not isinstance(item, dict) for item in legacy_punches):
                raise ValueError("Legacy attendance punch file has an invalid format")
            punches.extend(legacy_punches)

        if os.path.exists(PUNCHES_LOG_FILE):
            punches.extend(read_punch_jsonl(PUNCHES_LOG_FILE))

        if start_date:
            month_names = punch_months_between(start_date, end_date)
        else:
            month_names = [
                os.path.basename(path)[:-6]
                for path in glob.glob(os.path.join(PUNCHES_PARTITION_DIR, "????-??.jsonl"))
            ]
        for month in month_names:
            path = os.path.join(PUNCHES_PARTITION_DIR, f"{month}.jsonl")
            if os.path.exists(path):
                punches.extend(read_punch_jsonl(path))

    filtered = []
    for punch in punches:
        record_date = punch_date(punch)
        if start_date and not start_date <= record_date <= end_date:
            continue
        if employee_id and str(punch.get("empId", "")) != str(employee_id):
            continue
        key = (str(punch.get("timestamp") or f"{record_date}T{punch.get('time', '')}"), str(punch.get("id") or ""))
        if after and key >= after:
            continue
        filtered.append((key, punch))

    filtered.sort(key=lambda item: item[0], reverse=True)
    page = filtered[:limit + 1]
    has_more = len(page) > limit
    records = [item[1] for item in page[:limit]]
    return {
        "punches": records,
        "hasMore": has_more,
        "nextCursor": encode_punch_cursor(records[-1]) if has_more and records else None
    }


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
    if os.environ.get("RAILWAY_ENVIRONMENT") and not RAILWAY_VOLUME_MOUNT_PATH:
        app.logger.error("Punch storage is not durable: Railway Volume mount path is missing")
        return jsonify({
            "success": False,
            "status": "PUNCH_STORAGE_UNAVAILABLE",
            "message": "تسجيل البصمات متوقف مؤقتاً لحماية السجل؛ يلزم ربط وحدة تخزين دائمة بالخادم."
        }), 503
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
        "id": f"punch_{uuid.uuid4().hex}",
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
    try:
        save_punch(punch_record)
    except (OSError, TypeError, ValueError):
        app.logger.exception("Failed to persist attendance punch")
        return jsonify({"success": False, "message": "تعذر حفظ حركة البصمة. حاول مرة أخرى أو أبلغ مدير النظام."}), 500

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
    claims = g.auth_claims
    screen_access = claims.get("screenAccess") or {}
    is_admin = claims.get("role") == "admin"
    is_employee = claims.get("role") == "employee"
    can_view_all = is_admin or any(
        screen_access.get(screen) in ("view", "edit")
        for screen in ("screen-attendance", "screen-punches-payroll")
    )
    if not is_employee and not can_view_all:
        return jsonify({"success": False, "message": "ليست لديك صلاحية عرض سجل البصمات."}), 403
    employee_id = str(claims.get("empId") or "").strip()
    if is_employee and not is_admin and not employee_id:
        return jsonify({"success": False, "message": "حساب المستخدم غير مرتبط برقم موظف."}), 403
    start_date = request.args.get("startDate")
    end_date = request.args.get("endDate")
    if bool(start_date) != bool(end_date) or (
        start_date and (not valid_iso_date(start_date) or not valid_iso_date(end_date) or end_date < start_date)
    ):
        return jsonify({"success": False, "message": "نطاق تواريخ سجل البصمات غير صالح."}), 400
    cursor = request.args.get("cursor")
    try:
        decode_punch_cursor(cursor)
    except ValueError:
        return jsonify({"success": False, "message": "مؤشر صفحة سجل البصمات غير صالح."}), 400
    try:
        try:
            limit = int(request.args.get("limit", "200"))
        except ValueError:
            return jsonify({"success": False, "message": "حجم الصفحة غير صالح."}), 400
        if not 1 <= limit <= 500:
            return jsonify({"success": False, "message": "حجم الصفحة يجب أن يكون بين 1 و500."}), 400
        page = load_punches_page(
            start_date=start_date,
            end_date=end_date,
            limit=limit,
            cursor=cursor,
            employee_id=employee_id if is_employee and not is_admin else None
        )
    except (OSError, ValueError, json.JSONDecodeError):
        app.logger.exception("Failed to read attendance punch history")
        return jsonify({"success": False, "message": "تعذر قراءة سجل البصمات؛ لم يتم تجاهل أي بيانات."}), 500
    return jsonify({"success": True, **page})


def build_employee_self_service_data(employee_id, employees, attendance, adjustments, holidays):
    employee_id = str(employee_id)
    if (
        not isinstance(employees, list) or
        not isinstance(attendance, list) or
        not isinstance(adjustments, dict) or
        not isinstance(holidays, list)
    ):
        raise ValueError("Stored employee self-service data is invalid")
    employee = next(
        (
            entry for entry in employees
            if isinstance(entry, dict) and str(entry.get("id") or "") == employee_id
        ),
        None
    )
    if not employee:
        return None

    own_attendance = [
        entry for entry in attendance
        if isinstance(entry, dict) and str(entry.get("empId") or "") == employee_id
    ]
    own_adjustments = {
        str(period): {employee_id: records[employee_id]}
        for period, records in adjustments.items()
        if isinstance(records, dict) and employee_id in records
    }
    visible_employee = {
        key: employee[key]
        for key in ("id", "name", "code", "job", "shiftHours", "basicSalary", "status", "offDay")
        if key in employee
    }
    return {
        "employee": visible_employee,
        "attendance": own_attendance,
        "salaryAdjustments": own_adjustments,
        "officialHolidays": holidays
    }


_SYNC_MISSING = object()


class SyncMergeConflict(Exception):
    def __init__(self, path):
        super().__init__(path)
        self.path = path


def _sync_value_equal(left, right):
    if left is _SYNC_MISSING or right is _SYNC_MISSING:
        return left is right
    return left == right


def _sync_copy(value):
    return value if value is _SYNC_MISSING else copy.deepcopy(value)


def _merge_sync_values(base, desired, latest, path="data"):
    if _sync_value_equal(desired, base):
        return _sync_copy(latest)
    if _sync_value_equal(latest, base):
        return _sync_copy(desired)
    if _sync_value_equal(desired, latest):
        return _sync_copy(latest)

    if all(isinstance(value, dict) or value is _SYNC_MISSING for value in (base, desired, latest)):
        base_map = {} if base is _SYNC_MISSING else base
        desired_map = {} if desired is _SYNC_MISSING else desired
        latest_map = {} if latest is _SYNC_MISSING else latest
        merged = {}
        for key in base_map.keys() | desired_map.keys() | latest_map.keys():
            value = _merge_sync_values(
                base_map.get(key, _SYNC_MISSING),
                desired_map.get(key, _SYNC_MISSING),
                latest_map.get(key, _SYNC_MISSING),
                f"{path}.{key}"
            )
            if value is not _SYNC_MISSING:
                merged[key] = value
        return merged

    if all(isinstance(value, list) or value is _SYNC_MISSING for value in (base, desired, latest)):
        base_list = [] if base is _SYNC_MISSING else base
        desired_list = [] if desired is _SYNC_MISSING else desired
        latest_list = [] if latest is _SYNC_MISSING else latest

        def identity(item):
            if not isinstance(item, dict):
                return None
            if item.get("empId") is not None and item.get("date"):
                return f"attendance:{item['empId']}:{item['date']}"
            if item.get("id") is not None:
                return f"id:{item['id']}"
            if item.get("username"):
                return f"username:{str(item['username']).strip().lower()}"
            return None

        all_items = base_list + desired_list + latest_list
        if all_items and all(identity(item) is not None for item in all_items):
            def indexed(items):
                result = {}
                for item in items:
                    key = identity(item)
                    if key in result:
                        raise SyncMergeConflict(f"{path}.duplicate-id:{key}")
                    result[key] = item
                return result

            base_items = indexed(base_list)
            desired_items = indexed(desired_list)
            latest_items = indexed(latest_list)
            key_order = list(latest_items)
            key_order.extend(key for key in desired_items if key not in latest_items)
            merged_items = []
            for key in key_order:
                item = _merge_sync_values(
                    base_items.get(key, _SYNC_MISSING),
                    desired_items.get(key, _SYNC_MISSING),
                    latest_items.get(key, _SYNC_MISSING),
                    f"{path}[id={key}]"
                )
                if item is not _SYNC_MISSING:
                    merged_items.append(item)
            return merged_items

        def indexed_values(items):
            return {json.dumps(item, ensure_ascii=False, sort_keys=True): item for item in items}

        base_items = indexed_values(base_list)
        desired_items = indexed_values(desired_list)
        latest_items = indexed_values(latest_list)
        key_order = list(latest_items)
        key_order.extend(key for key in desired_items if key not in latest_items)
        key_order.extend(key for key in base_items if key not in desired_items and key not in latest_items)
        merged_items = []
        for key in key_order:
            base_has = key in base_items
            desired_has = key in desired_items
            latest_has = key in latest_items
            if desired_has == base_has:
                include = latest_has
            elif latest_has == base_has:
                include = desired_has
            else:
                include = desired_has
            if include:
                source = desired_items if desired_has and desired_has != base_has else latest_items
                merged_items.append(source[key])
        return merged_items

    raise SyncMergeConflict(path)


SYNC_COLLECTIONS = {
    "employees": ("list", "screen-employees"),
    "attendance": ("list", "screen-attendance"),
    "departments": ("list", "screen-employees"),
    "shifts": ("list", "screen-attendance"),
    "salaryAdjustments": ("data", "screen-salary-adjustments"),
    "payrollDelivery": ("data", "screen-payroll-delivery"),
    "payrollCycles": ("data", "screen-payroll-summary"),
    "officialHolidays": ("list", "screen-attendance"),
    "notifications": ("list", None),
    "users": ("list", None)
}


@app.route("/api/firebase/collection/<collection_key>", methods=["POST"])
@require_firebase_auth()
def sync_firebase_collection_api(collection_key):
    claims = g.auth_claims
    field_and_screen = SYNC_COLLECTIONS.get(collection_key)
    if not field_and_screen:
        return jsonify({"success": False, "message": "مجموعة المزامنة غير مسموح بها."}), 404
    field, required_screen = field_and_screen
    is_admin = claims.get("role") == "admin"
    if collection_key == "users" and not is_admin:
        return jsonify({"success": False, "message": "مزامنة المستخدمين متاحة لمدير النظام فقط."}), 403
    if not is_admin and required_screen and (claims.get("screenAccess") or {}).get(required_screen) != "edit":
        return jsonify({"success": False, "message": "ليست لديك صلاحية تعديل هذه البيانات."}), 403

    body = request.get_json(silent=True)
    if not isinstance(body, dict) or "baseData" not in body or "data" not in body:
        return jsonify({"success": False, "message": "بيانات المزامنة غير مكتملة."}), 400
    base_data = body["baseData"]
    desired_data = body["data"]
    expected_type = list if field == "list" else dict
    if not isinstance(base_data, expected_type) or not isinstance(desired_data, expected_type):
        return jsonify({"success": False, "message": "شكل بيانات المزامنة غير صالح."}), 400

    try:
        _, db = get_firebase_admin()
        document_ref = db.collection("sidi_yaqout_erp").document(collection_key)
        from google.cloud import firestore
        transaction = db.transaction()

        @firestore.transactional
        def apply_merge(transaction):
            snapshot = document_ref.get(transaction=transaction)
            document = snapshot.to_dict() if snapshot.exists else {}
            latest_data = document.get(field, [] if field == "list" else {})
            if not isinstance(latest_data, expected_type):
                raise ValueError("Stored sync collection has an invalid format")
            merged_data = _merge_sync_values(base_data, desired_data, latest_data)
            if not _sync_value_equal(merged_data, latest_data):
                transaction.set(document_ref, {field: merged_data}, merge=True)
            return merged_data

        merged = apply_merge(transaction)
        return jsonify({"success": True, "data": merged})
    except SyncMergeConflict as conflict:
        return jsonify({
            "success": False,
            "conflict": True,
            "path": conflict.path,
            "message": "تغيّر هذا السجل على جهاز آخر؛ لم يتم الكتابة فوق أي تعديل. احتفظ بتعديلاتك وراجع النسخة السحابية."
        }), 409
    except Exception:
        app.logger.exception("Firebase collection synchronization failed")
        return jsonify({"success": False, "message": "تعذرت مزامنة البيانات. لم يتم تأكيد حفظ التغيير."}), 500


@app.route("/api/employee/self-service-data", methods=["GET"])
@require_firebase_auth()
def employee_self_service_data_api():
    claims = g.auth_claims
    if claims.get("role") != "employee":
        return jsonify({"success": False, "message": "هذه الواجهة مخصصة لحساب الموظف."}), 403
    employee_id = str(claims.get("empId") or "").strip()
    if not employee_id:
        return jsonify({"success": False, "message": "حساب المستخدم غير مرتبط برقم موظف."}), 403

    try:
        _, db = get_firebase_admin()
        base_ref = db.collection("sidi_yaqout_erp")
        employee_snapshot = base_ref.document("employees").get()
        attendance_snapshot = base_ref.document("attendance").get()
        adjustments_snapshot = base_ref.document("salaryAdjustments").get()
        holidays_snapshot = base_ref.document("officialHolidays").get()

        employee_document = employee_snapshot.to_dict() if employee_snapshot.exists else {}
        employee_list = employee_document.get("list", []) if isinstance(employee_document, dict) else []

        attendance_document = attendance_snapshot.to_dict() if attendance_snapshot.exists else {}
        attendance_list = attendance_document.get("list", []) if isinstance(attendance_document, dict) else []

        adjustments_document = adjustments_snapshot.to_dict() if adjustments_snapshot.exists else {}
        adjustments = adjustments_document.get("data", {}) if isinstance(adjustments_document, dict) else {}

        holidays_document = holidays_snapshot.to_dict() if holidays_snapshot.exists else {}
        holidays = holidays_document.get("list", []) if isinstance(holidays_document, dict) else []
        result = build_employee_self_service_data(employee_id, employee_list, attendance_list, adjustments, holidays)
        if not result:
            return jsonify({"success": False, "message": "لم يتم العثور على بيانات الموظف المرتبط بالحساب."}), 404
        return jsonify({"success": True, **result})
    except Exception:
        app.logger.exception("Unable to load employee self-service data")
        return jsonify({"success": False, "message": "تعذر تحميل بياناتك الآن. حاول مرة أخرى."}), 500


def leaves_permissions_document(db):
    return db.collection(LEAVES_PERMISSIONS_PATH[0]).document(LEAVES_PERMISSIONS_PATH[1])


def leaves_employee_records(db):
    snapshot = db.collection("sidi_yaqout_erp").document("employees").get()
    value = snapshot.to_dict() if snapshot.exists else {}
    records = value.get("list", []) if isinstance(value, dict) else []
    return [employee for employee in records if isinstance(employee, dict)] if isinstance(records, list) else []


def leaves_is_admin(claims):
    return claims.get("role") == "admin" or normalized_username(claims.get("username")) == "admin"


def leaves_is_manager(claims):
    return (
        claims.get("role") in ("admin", "manager", "supervisor")
        or claims.get("isManager") is True
    )


def leaves_can_manage_employee(claims, employee, employees, allow_self=True):
    if leaves_is_admin(claims):
        return True
    actor_id = str(claims.get("empId") or "")
    employee_id = str(employee.get("id") or "")
    if allow_self and actor_id and employee_id == actor_id:
        return True
    if not leaves_is_manager(claims) or not actor_id or employee_id == actor_id:
        return False
    actor = next((entry for entry in employees if str(entry.get("id") or "") == actor_id), {})
    return (
        str(employee.get("managerId") or "") == actor_id
        or bool(employee.get("managerName") and employee.get("managerName") == claims.get("fullName"))
        or bool(actor.get("job") and employee.get("job") and str(actor["job"]).strip() == str(employee["job"]).strip())
    )


def leaves_visible_to_user(claims, item, employees):
    if leaves_is_admin(claims):
        return True
    actor_id = str(claims.get("empId") or "")
    if actor_id and str(item.get("empId") or "") == actor_id:
        return True
    employee = next((entry for entry in employees if str(entry.get("id") or "") == str(item.get("empId") or "")), None)
    return bool(employee and leaves_can_manage_employee(claims, employee, employees, allow_self=False))


def update_leaves_permissions(mutator):
    from google.cloud import firestore

    _, db = get_firebase_admin()
    document = leaves_permissions_document(db)
    transaction = db.transaction(max_attempts=5)

    @firestore.transactional
    def apply_update(txn):
        snapshot = document.get(transaction=txn)
        value = snapshot.to_dict() if snapshot.exists else {}
        current = value.get("list", []) if isinstance(value, dict) else []
        if not isinstance(current, list):
            raise ValueError("Stored leaves and permissions data is invalid")
        result, updated = mutator(current)
        txn.set(document, {"list": updated})
        return result

    return apply_update(transaction)


def valid_iso_date(value):
    try:
        parsed = datetime.datetime.strptime(str(value), "%Y-%m-%d").date()
        return parsed.isoformat() == value
    except (TypeError, ValueError):
        return False


@app.route("/api/leaves-permissions", methods=["GET", "POST", "PUT", "DELETE"])
@require_firebase_auth()
def leaves_permissions_api():
    claims = g.auth_claims
    screen_access = claims.get("screenAccess") or {}
    if not leaves_is_admin(claims) and screen_access.get("screen-leaves-permissions") not in ("view", "edit"):
        return jsonify({"success": False, "message": "ليست لديك صلاحية استخدام شاشة الإجازات والأذونات."}), 403

    try:
        _, db = get_firebase_admin()
        document = leaves_permissions_document(db)
        employees = leaves_employee_records(db)

        if request.method == "GET":
            snapshot = document.get()
            value = snapshot.to_dict() if snapshot.exists else {}
            records = value.get("list", []) if isinstance(value, dict) else []
            if not isinstance(records, list):
                raise ValueError("Stored leaves and permissions data is invalid")
            visible = [item for item in records if isinstance(item, dict) and leaves_visible_to_user(claims, item, employees)]
            available_employees = [
                {
                    key: employee.get(key)
                    for key in ("id", "name", "job", "managerId", "managerName", "annualLeaveQuota")
                    if key in employee
                }
                for employee in employees
                if leaves_can_manage_employee(claims, employee, employees)
            ]
            return jsonify({"success": True, "items": visible, "employees": available_employees})

        if not leaves_is_admin(claims):
            return jsonify({"success": False, "message": "هذه العملية متاحة لمدير النظام فقط."}), 403

        if request.method == "PUT":
            data = request.get_json(silent=True) or {}
            items = data.get("items")
            if not isinstance(items, list) or any(not isinstance(item, dict) or not item.get("id") for item in items):
                return jsonify({"success": False, "message": "بيانات الاستعادة غير صالحة."}), 400
            ids = [str(item["id"]) for item in items]
            if len(ids) != len(set(ids)):
                return jsonify({"success": False, "message": "تحتوي بيانات الاستعادة على معرفات مكررة."}), 400

            def replace_all(_current):
                return len(items), items

            count = update_leaves_permissions(replace_all)
            return jsonify({"success": True, "count": count})

        if request.method == "DELETE":
            update_leaves_permissions(lambda _current: (True, []))
            return jsonify({"success": True})

        data = request.get_json(silent=True) or {}
        item_type = str(data.get("itemType") or "")
        if item_type not in ("leave", "permission"):
            return jsonify({"success": False, "message": "نوع الطلب غير صالح."}), 400
        employee_id = str(data.get("empId") or "").strip()
        employee = next((entry for entry in employees if str(entry.get("id") or "") == employee_id), None)
        if not employee or not leaves_can_manage_employee(claims, employee, employees):
            return jsonify({"success": False, "message": "لا يمكنك تقديم طلب لهذا الموظف."}), 403

        start_date = str(data.get("startDate") or "")
        end_date = str(data.get("endDate") or "")
        if not valid_iso_date(start_date) or not valid_iso_date(end_date) or end_date < start_date:
            return jsonify({"success": False, "message": "تواريخ الطلب غير صالحة."}), 400

        item_id = f"{item_type}_{uuid.uuid4().hex}"
        submitted_by = str(claims.get("fullName") or claims.get("username") or "")[:120]
        item = {
            "id": item_id,
            "itemType": item_type,
            "empId": employee.get("id"),
            "empCode": employee.get("id"),
            "empName": str(employee.get("name") or "")[:120],
            "dept": str(employee.get("job") or "عام")[:120],
            "managerEmpId": employee.get("managerId") or None,
            "managerName": str(employee.get("managerName") or "مدير النظام")[:120],
            "reason": str(data.get("reason") or "").strip()[:2000],
            "status": "pending",
            "submittedBy": submitted_by,
            "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "approvedBy": None,
            "approvedAt": None,
            "rejectionReason": None
        }
        if item_type == "leave":
            item.update({
                "leaveType": str(data.get("leaveType") or "")[:100],
                "leaveTypeTitle": str(data.get("leaveTypeTitle") or "")[:120],
                "startDate": start_date,
                "endDate": end_date,
                "daysCount": (datetime.datetime.strptime(end_date, "%Y-%m-%d").date()
                              - datetime.datetime.strptime(start_date, "%Y-%m-%d").date()).days + 1
            })
        else:
            time_from = str(data.get("startTime") or "")
            time_to = str(data.get("endTime") or "")
            try:
                from_minutes = datetime.datetime.strptime(time_from, "%H:%M").hour * 60 + datetime.datetime.strptime(time_from, "%H:%M").minute
                to_parsed = datetime.datetime.strptime(time_to, "%H:%M")
                to_minutes = to_parsed.hour * 60 + to_parsed.minute
            except ValueError:
                return jsonify({"success": False, "message": "أوقات الإذن غير صالحة."}), 400
            if to_minutes <= from_minutes:
                return jsonify({"success": False, "message": "وقت نهاية الإذن يجب أن يأتي بعد وقت بدايته."}), 400
            item.update({
                "permType": str(data.get("permType") or "")[:100],
                "permTypeTitle": str(data.get("permTypeTitle") or "")[:120],
                "startDate": start_date,
                "endDate": start_date,
                "startTime": time_from,
                "endTime": time_to,
                "hoursCount": round((to_minutes - from_minutes) / 60, 2),
                "daysCount": 0
            })

        def append_item(current):
            current.insert(0, item)
            return item, current

        saved_item = update_leaves_permissions(append_item)
        return jsonify({"success": True, "item": saved_item}), 201
    except Exception:
        app.logger.exception("Leaves and permissions API failed")
        return jsonify({"success": False, "message": "تعذر إتمام العملية. لم يتم تأكيد حفظ التغيير."}), 500


@app.route("/api/leaves-permissions/<item_id>/decision", methods=["POST"])
@require_firebase_auth()
def leaves_permissions_decision_api(item_id):
    claims = g.auth_claims
    screen_access = claims.get("screenAccess") or {}
    if not leaves_is_admin(claims) and screen_access.get("screen-leaves-permissions") not in ("view", "edit"):
        return jsonify({"success": False, "message": "ليست لديك صلاحية استخدام شاشة الإجازات والأذونات."}), 403

    data = request.get_json(silent=True) or {}
    decision = str(data.get("decision") or "")
    if decision not in ("approve", "reject"):
        return jsonify({"success": False, "message": "قرار الطلب غير صالح."}), 400

    try:
        _, db = get_firebase_admin()
        employees = leaves_employee_records(db)
        claims_is_admin = leaves_is_admin(claims)
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        actor_name = str(claims.get("fullName") or claims.get("username") or "")[:120]

        def decide(current):
            item = next((entry for entry in current if isinstance(entry, dict) and str(entry.get("id")) == item_id), None)
            if not item:
                raise LookupError("طلب الإجازة أو الإذن غير موجود.")
            employee = next((entry for entry in employees if str(entry.get("id") or "") == str(item.get("empId") or "")), None)
            if not claims_is_admin and (not employee or not leaves_can_manage_employee(claims, employee, employees, allow_self=False)):
                raise PermissionError("لا يمكنك اعتماد أو رفض هذا الطلب.")
            if item.get("status") != "pending":
                raise ValueError("تم اتخاذ قرار بشأن هذا الطلب بالفعل.")
            item["status"] = "approved" if decision == "approve" else "rejected"
            item["approvedBy" if decision == "approve" else "rejectedBy"] = actor_name
            item["approvedAt"] = now
            if decision == "reject":
                item["rejectionReason"] = str(data.get("reason") or "").strip()[:1000] or "اعتذار لظروف العمل"
            return item, current

        item = update_leaves_permissions(decide)
        return jsonify({"success": True, "item": item})
    except LookupError as exc:
        return jsonify({"success": False, "message": str(exc)}), 404
    except PermissionError as exc:
        return jsonify({"success": False, "message": str(exc)}), 403
    except ValueError as exc:
        return jsonify({"success": False, "message": str(exc)}), 409
    except Exception:
        app.logger.exception("Leaves and permissions decision failed")
        return jsonify({"success": False, "message": "تعذر تسجيل قرار الطلب."}), 500


@app.route("/api/leaves-permissions/<item_id>", methods=["DELETE"])
@require_firebase_auth(admin_only=True)
def delete_leaves_permission_api(item_id):
    try:
        def delete_item(current):
            updated = [item for item in current if not (isinstance(item, dict) and str(item.get("id")) == item_id)]
            return len(updated) != len(current), updated

        deleted = update_leaves_permissions(delete_item)
        if not deleted:
            return jsonify({"success": False, "message": "الطلب غير موجود."}), 404
        return jsonify({"success": True})
    except Exception:
        app.logger.exception("Deleting a leave or permission request failed")
        return jsonify({"success": False, "message": "تعذر حذف الطلب."}), 500


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
        "attendance_punches.jsonl",
        "punches_by_month",
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
