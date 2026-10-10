from flask import Flask, send_from_directory
from functools import wraps
import os
import copy
import threading
import time
import uuid
from werkzeug.middleware.proxy_fix import ProxyFix
from face_attendance import (
    FaceAttendanceError,
    FaceSystemUnavailable,
    get_face_attendance_store,
)

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
    response.headers["Permissions-Policy"] = "camera=(self)"
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
import datetime
import base64
import math
from zoneinfo import ZoneInfo
import glob
import hashlib
import re
import sqlite3
import tempfile
from contextlib import contextmanager
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


def verify_attendance_manager_password(username, password, db):
    username = normalized_username(username)
    if not username or not password or len(password) > 256:
        return False

    profiles = user_profiles_document(db).get().to_dict() or {}
    users = profiles.get("list", [])
    user = next(
        (
            entry for entry in users
            if isinstance(entry, dict)
            and normalized_username(entry.get("username")) == username
        ),
        None,
    )
    if not user:
        return False

    credential_snapshot = db.collection("sidi_yaqout_auth").document(
        auth_user_key(username)
    ).get()
    bootstrap_password = os.environ.get("FIREBASE_BOOTSTRAP_ADMIN_PASSWORD", "")
    if (
        username == "admin"
        and bootstrap_password
        and hmac_compare(password, bootstrap_password)
        and not credential_snapshot.exists
    ):
        return True
    if credential_snapshot.exists:
        return verify_password(password, credential_snapshot.to_dict())
    if username == "admin" and bootstrap_password:
        return False
    return hmac_compare(password, str(user.get("pin", "")))


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

PUNCHES_FILE = os.path.join(BASE_DIR, "attendance_punches.json")
RAILWAY_VOLUME_MOUNT_PATH = os.environ.get("RAILWAY_VOLUME_MOUNT_PATH")
PUNCHES_DATA_DIR = RAILWAY_VOLUME_MOUNT_PATH or BASE_DIR
PUNCHES_LOG_FILE = os.path.join(PUNCHES_DATA_DIR, "attendance_punches.jsonl")
PUNCHES_PARTITION_DIR = os.path.join(PUNCHES_DATA_DIR, "punches_by_month")
PUNCHES_SQLITE_FILE = os.path.join(PUNCHES_DATA_DIR, "punches.sqlite3")
FACE_MODEL_DIRECTORY = os.path.join(PUNCHES_DATA_DIR, "face_models")
PUNCHES_LOCK = threading.Lock()
LEAVES_PERMISSIONS_PATH = ("sidi_yaqout_erp", "leavesPermissions")
FACE_TEMPLATE_ENCRYPTION_KEY = os.environ.get("FACE_TEMPLATE_ENCRYPTION_KEY", "")

def load_punches():
    with PUNCHES_LOCK, open_punch_database() as connection:
        rows = connection.execute(
            "SELECT payload FROM punches ORDER BY sort_timestamp DESC, punch_id DESC"
        ).fetchall()
    return [json.loads(row[0]) for row in rows]


def punch_database_sources():
    sources = [PUNCHES_FILE, PUNCHES_LOG_FILE]
    if PUNCHES_DATA_DIR != BASE_DIR:
        sources.append(os.path.join(BASE_DIR, "attendance_punches.jsonl"))
    partition_dirs = {PUNCHES_PARTITION_DIR}
    if PUNCHES_DATA_DIR != BASE_DIR:
        partition_dirs.add(os.path.join(BASE_DIR, "punches_by_month"))
    for directory in partition_dirs:
        sources.extend(sorted(glob.glob(os.path.join(directory, "????-??.jsonl"))))
    return list(dict.fromkeys(path for path in sources if os.path.isfile(path)))


def read_punch_source(file_path):
    if file_path.endswith(".json"):
        with open(file_path, "r", encoding="utf-8") as source:
            records = json.load(source)
        if not isinstance(records, list) or any(not isinstance(item, dict) for item in records):
            raise ValueError("Legacy attendance punch file has an invalid format")
        return records
    return read_punch_jsonl(file_path)


def punch_storage_id(punch):
    punch_id = punch.get("id")
    if punch_id is not None and str(punch_id):
        return str(punch_id)
    canonical = json.dumps(punch, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return "legacy-" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def punch_sort_timestamp(punch):
    return str(punch.get("timestamp") or f"{punch_date(punch)}T{punch.get('time', '')}")


@contextmanager
def open_punch_database():
    os.makedirs(os.path.dirname(PUNCHES_SQLITE_FILE) or ".", exist_ok=True)
    connection = sqlite3.connect(PUNCHES_SQLITE_FILE, timeout=30)
    try:
        connection.execute("PRAGMA busy_timeout = 30000")
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute(
            "CREATE TABLE IF NOT EXISTS punches ("
            "punch_id TEXT PRIMARY KEY, sort_timestamp TEXT NOT NULL, emp_id TEXT, "
            "punch_date TEXT NOT NULL, payload TEXT NOT NULL)"
        )
        connection.execute(
            "CREATE TABLE IF NOT EXISTS imported_punch_sources (path TEXT PRIMARY KEY)"
        )
        connection.execute(
            "CREATE TABLE IF NOT EXISTS attendance_punch_guard ("
            "emp_id TEXT NOT NULL, punch_date TEXT NOT NULL, punch_type TEXT NOT NULL, "
            "PRIMARY KEY (emp_id, punch_date, punch_type))"
        )
        connection.execute(
            "CREATE TABLE IF NOT EXISTS face_templates ("
            "emp_id TEXT PRIMARY KEY, employee_name TEXT NOT NULL, "
            "nonce BLOB NOT NULL, encrypted_template BLOB NOT NULL, "
            "updated_at TEXT NOT NULL, updated_by TEXT NOT NULL, consented_at TEXT NOT NULL)"
        )
        face_template_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(face_templates)").fetchall()
        }
        if "consented_at" not in face_template_columns:
            connection.execute(
                "ALTER TABLE face_templates ADD COLUMN consented_at TEXT NOT NULL DEFAULT ''"
            )
        connection.execute(
            "CREATE TABLE IF NOT EXISTS face_challenges ("
            "token_hash TEXT PRIMARY KEY, emp_id TEXT NOT NULL, "
            "employee_name TEXT NOT NULL, punch_type TEXT NOT NULL, expires_at INTEGER NOT NULL)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_punches_date_order "
            "ON punches (punch_date, sort_timestamp DESC, punch_id DESC)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_punches_employee_date_order "
            "ON punches (emp_id, punch_date, sort_timestamp DESC, punch_id DESC)"
        )
        for source_path in punch_database_sources():
            imported = connection.execute(
                "SELECT 1 FROM imported_punch_sources WHERE path = ?", (os.path.abspath(source_path),)
            ).fetchone()
            if imported:
                continue
            records = read_punch_source(source_path)
            for punch in records:
                connection.execute(
                    "INSERT OR IGNORE INTO punches (punch_id, sort_timestamp, emp_id, punch_date, payload) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (
                        punch_storage_id(punch),
                        punch_sort_timestamp(punch),
                        str(punch.get("empId") or ""),
                        punch_date(punch),
                        json.dumps(punch, ensure_ascii=False, separators=(",", ":"))
                    )
                )
            connection.execute(
                "INSERT INTO imported_punch_sources (path) VALUES (?)", (os.path.abspath(source_path),)
            )
        connection.commit()
        yield connection
    except Exception:
        connection.rollback()
        connection.close()
        raise
    else:
        connection.commit()
        connection.close()


def save_punch(punch_record):
    punch_date = str(punch_record.get("date") or "")
    if not valid_iso_date(punch_date):
        raise ValueError("Attendance punch has an invalid date")
    serialized = json.dumps(punch_record, ensure_ascii=False, separators=(",", ":"))
    with PUNCHES_LOCK, open_punch_database() as connection:
        if punch_record.get("source") in ("face_recognition", "manual_override"):
            existing_rows = connection.execute(
                "SELECT payload FROM punches WHERE emp_id = ? AND punch_date = ?",
                (str(punch_record.get("empId") or ""), punch_date),
            ).fetchall()
            for (existing_payload,) in existing_rows:
                existing = json.loads(existing_payload)
                if (
                    existing.get("type") == punch_record.get("type")
                    and existing.get("status") in ("ACCEPTED", "MANUAL_ACCEPTED")
                    and existing.get("source") in ("gps_punch", "face_recognition", "manual_override")
                ):
                    raise DuplicateAttendancePunchError(
                        "تم تسجيل هذه الحركة للموظف في اليوم نفسه بالفعل."
                    )
            try:
                connection.execute(
                    "INSERT INTO attendance_punch_guard (emp_id, punch_date, punch_type) "
                    "VALUES (?, ?, ?)",
                    (
                        str(punch_record.get("empId") or ""),
                        punch_date,
                        str(punch_record.get("type") or ""),
                    ),
                )
            except sqlite3.IntegrityError as exc:
                raise DuplicateAttendancePunchError(
                    "تم تسجيل هذه الحركة للموظف في اليوم نفسه بالفعل."
                ) from exc
        connection.execute(
            "INSERT OR IGNORE INTO punches (punch_id, sort_timestamp, emp_id, punch_date, payload) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                punch_storage_id(punch_record),
                punch_sort_timestamp(punch_record),
                str(punch_record.get("empId") or ""),
                punch_date,
                serialized
            )
        )


class DuplicateAttendancePunchError(ValueError):
    pass


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
    conditions = []
    parameters = []
    if start_date:
        conditions.append("punch_date BETWEEN ? AND ?")
        parameters.extend((start_date, end_date))
    if employee_id:
        conditions.append("emp_id = ?")
        parameters.append(str(employee_id))
    if after:
        conditions.append("(sort_timestamp < ? OR (sort_timestamp = ? AND punch_id < ?))")
        parameters.extend((after[0], after[0], after[1]))
    where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""
    with PUNCHES_LOCK, open_punch_database() as connection:
        rows = connection.execute(
            "SELECT punch_id, sort_timestamp, payload FROM punches" + where_clause +
            " ORDER BY sort_timestamp DESC, punch_id DESC LIMIT ?",
            (*parameters, limit + 1)
        ).fetchall()
    has_more = len(rows) > limit
    page = rows[:limit]
    records = [json.loads(row[2]) for row in page]
    return {
        "punches": records,
        "hasMore": has_more,
        "nextCursor": base64.urlsafe_b64encode(json.dumps(
            [page[-1][1], page[-1][0]], separators=(",", ":")
        ).encode("utf-8")).decode("ascii") if has_more and page else None
    }


def attendance_kiosk_allowed(claims):
    return (
        claims.get("role") == "admin"
        or (claims.get("screenAccess") or {}).get("screen-attendance") == "edit"
    )


def require_durable_attendance_storage():
    if os.environ.get("RAILWAY_ENVIRONMENT") and not RAILWAY_VOLUME_MOUNT_PATH:
        app.logger.error("Attendance and face-template storage is not durable: Railway Volume is missing")
        return jsonify({
            "success": False,
            "status": "ATTENDANCE_STORAGE_UNAVAILABLE",
            "message": "تسجيل الحضور متوقف لحماية السجل؛ يلزم ربط وحدة تخزين دائمة بالخادم."
        }), 503
    return None


def get_face_store():
    return get_face_attendance_store(
        PUNCHES_SQLITE_FILE,
        os.environ.get("FACE_TEMPLATE_ENCRYPTION_KEY", FACE_TEMPLATE_ENCRYPTION_KEY),
    )


def face_image_from_request(data):
    if not isinstance(data, dict):
        raise FaceAttendanceError("صيغة بيانات الكاميرا غير صالحة.")
    image_value = data.get("image")
    prefix = "data:image/jpeg;base64,"
    if not isinstance(image_value, str) or not image_value.startswith(prefix):
        raise FaceAttendanceError("تعذر قراءة صورة الوجه من الكاميرا.")
    encoded = image_value[len(prefix):]
    if len(encoded) > 2_800_000:
        raise FaceAttendanceError("صورة الوجه أكبر من الحد المسموح.")
    try:
        image_bytes = base64.b64decode(encoded, validate=True)
    except (ValueError, base64.binascii.Error) as exc:
        raise FaceAttendanceError("صيغة صورة الوجه غير صالحة.") from exc
    if not image_bytes.startswith(b"\xff\xd8") or len(image_bytes) > 2 * 1024 * 1024:
        raise FaceAttendanceError("يجب إرسال صورة JPEG صالحة لا تتجاوز 2 ميجابايت.")
    return image_bytes


def employee_records_by_id():
    _, database = get_firebase_admin()
    employees = leaves_employee_records(database)
    return {str(employee.get("id") or ""): employee for employee in employees}


def next_attendance_punch_type(emp_id, punch_date):
    result = load_punches_page(
        start_date=punch_date,
        end_date=punch_date,
        limit=1000,
        employee_id=emp_id,
    )
    existing_types = {
        item.get("type")
        for item in result["punches"]
        if item.get("status") in ("ACCEPTED", "MANUAL_ACCEPTED")
        and item.get("type") in ("in", "out")
    }
    if "in" not in existing_types:
        return "in"
    if "out" not in existing_types:
        return "out"
    return None


def build_attendance_punch(emp_id, emp_name, punch_type, source, recorded_by, reason=None):
    now = datetime.datetime.now().astimezone()
    punch_title = "حضور" if punch_type == "in" else "انصراف"
    record = {
        "id": f"punch_{uuid.uuid4().hex}",
        "empId": str(emp_id),
        "empName": str(emp_name),
        "type": punch_type,
        "typeTitle": punch_title,
        "source": source,
        "verificationMethod": "face" if source == "face_recognition" else "manual",
        "status": "ACCEPTED" if source == "face_recognition" else "MANUAL_ACCEPTED",
        "recordedBy": str(recorded_by.get("username") or "")[:100],
        "recordedByName": str(
            recorded_by.get("fullName") or recorded_by.get("username") or "مدير"
        )[:120],
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M:%S"),
        "timestamp": now.isoformat(),
    }
    if reason:
        record["manualReason"] = reason
    return record


@app.route("/api/geofence/config", methods=["GET", "POST"])
@require_firebase_auth()
def geofence_config_api():
    return jsonify({
        "success": False,
        "message": "تم إيقاف تسجيل الحضور بالموقع الجغرافي. استخدم التعرف على الوجه أو التسجيل اليدوي.",
    }), 410


@app.route("/api/attendance/check-in", methods=["POST"])
@require_firebase_auth()
def attendance_check_in_api():
    return jsonify({
        "success": False,
        "message": "تم إيقاف تسجيل GPS. استخدم شاشة الحضور بالوجه أو التسجيل اليدوي المخوّل.",
    }), 410


@app.route("/api/attendance/face/enrollments", methods=["GET", "POST"])
@require_firebase_auth()
def attendance_face_enrollments_api():
    if request.method == "GET":
        if not leaves_is_admin(g.auth_claims):
            return jsonify({"success": False, "message": "عرض تسجيلات الوجه متاح لمدير النظام فقط."}), 403
        try:
            return jsonify({"success": True, "enrollments": get_face_store().list_enrollments()})
        except FaceSystemUnavailable as exc:
            return jsonify({"success": False, "message": str(exc)}), 503
        except Exception:
            app.logger.exception("Failed to list face enrollments")
            return jsonify({"success": False, "message": "تعذر تحميل تسجيلات الوجه."}), 500

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"success": False, "message": "صيغة طلب تسجيل الوجه غير صالحة."}), 400
    emp_id = str(data.get("empId") or "").strip()[:100]
    if not emp_id or data.get("consentConfirmed") is not True:
        return jsonify({
            "success": False,
            "message": "اختر الموظف وأكد موافقته المستنيرة قبل تسجيل الوجه.",
        }), 400
    storage_error = require_durable_attendance_storage()
    if storage_error:
        return storage_error
    try:
        _, database = get_firebase_admin()
        employees = leaves_employee_records(database)
        employee = next(
            (entry for entry in employees if str(entry.get("id") or "") == emp_id),
            None,
        )
        if not employee:
            return jsonify({"success": False, "message": "الموظف غير موجود في سجل الموظفين."}), 404
        if not attendance_can_manage_employee(g.auth_claims, employee, employees):
            return jsonify({
                "success": False,
                "message": "تسجيل الوجه متاح لمدير النظام أو المدير المباشر للموظف فقط.",
            }), 403
        image_bytes = face_image_from_request(data)
        result = get_face_store().enroll(
            emp_id,
            str(employee.get("name") or employee.get("fullName") or emp_id)[:120],
            image_bytes,
            str(g.auth_claims.get("username") or "admin")[:100],
            FACE_MODEL_DIRECTORY,
        )
        return jsonify({"success": True, "enrollment": result})
    except FaceAttendanceError as exc:
        return jsonify({"success": False, "message": str(exc)}), 422
    except FaceSystemUnavailable as exc:
        return jsonify({"success": False, "message": str(exc)}), 503
    except Exception:
        app.logger.exception("Face enrollment failed")
        return jsonify({"success": False, "message": "تعذر تسجيل قالب الوجه. لم يتم تأكيد حفظه."}), 500


@app.route("/api/attendance/face/enrollments/<emp_id>", methods=["DELETE"])
@require_firebase_auth()
def attendance_face_enrollment_delete_api(emp_id):
    try:
        _, database = get_firebase_admin()
        employees = leaves_employee_records(database)
        employee = next(
            (entry for entry in employees if str(entry.get("id") or "") == str(emp_id)),
            None,
        )
        if not employee:
            return jsonify({"success": False, "message": "الموظف غير موجود في سجل الموظفين."}), 404
        if not attendance_can_manage_employee(g.auth_claims, employee, employees):
            return jsonify({
                "success": False,
                "message": "حذف قالب الوجه متاح لمدير النظام أو المدير المباشر للموظف فقط.",
            }), 403
        removed = get_face_store().remove_enrollment(str(emp_id)[:100])
        if not removed:
            return jsonify({"success": False, "message": "لا يوجد تسجيل وجه لهذا الموظف."}), 404
        return jsonify({"success": True})
    except FaceSystemUnavailable as exc:
        return jsonify({"success": False, "message": str(exc)}), 503
    except Exception:
        app.logger.exception("Failed to delete face enrollment")
        return jsonify({"success": False, "message": "تعذر حذف تسجيل الوجه."}), 500


@app.route("/api/attendance/face/match", methods=["POST"])
@require_firebase_auth()
def attendance_face_match_api():
    if not attendance_kiosk_allowed(g.auth_claims):
        return jsonify({"success": False, "message": "تحتاج صلاحية تعديل شاشة الحضور لاستخدام الكاميرا."}), 403
    storage_error = require_durable_attendance_storage()
    if storage_error:
        return storage_error
    try:
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"success": False, "message": "صيغة طلب مطابقة الوجه غير صالحة."}), 400
        image_bytes = face_image_from_request(data)
        emp_id, stored_name, _ = get_face_store().match(image_bytes, FACE_MODEL_DIRECTORY)
        employee = employee_records_by_id().get(emp_id)
        if not employee:
            return jsonify({
                "success": False,
                "message": "تعذر العثور على الموظف المرتبط بقالب الوجه. راجع مدير النظام.",
            }), 409
        emp_name = str(employee.get("name") or stored_name)[:120]
        today = datetime.datetime.now().strftime("%Y-%m-%d")
        punch_type = next_attendance_punch_type(emp_id, today)
        if punch_type is None:
            return jsonify({
                "success": False,
                "message": "تم تسجيل الحضور والانصراف لهذا الموظف اليوم بالفعل.",
            }), 409
        challenge, expires_at = get_face_store().create_challenge(emp_id, emp_name, punch_type)
        return jsonify({
            "success": True,
            "challenge": challenge,
            "expiresAt": expires_at,
            "empId": emp_id,
            "empName": emp_name,
            "type": punch_type,
            "typeTitle": "حضور" if punch_type == "in" else "انصراف",
        })
    except FaceAttendanceError as exc:
        return jsonify({"success": False, "message": str(exc)}), 422
    except FaceSystemUnavailable as exc:
        return jsonify({"success": False, "message": str(exc)}), 503
    except Exception:
        app.logger.exception("Face matching failed")
        return jsonify({"success": False, "message": "تعذر إتمام مطابقة الوجه. لم يتم تسجيل حركة."}), 500


@app.route("/api/attendance/face/punch", methods=["POST"])
@require_firebase_auth()
def attendance_face_punch_api():
    if not attendance_kiosk_allowed(g.auth_claims):
        return jsonify({"success": False, "message": "تحتاج صلاحية تعديل شاشة الحضور."}), 403
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"success": False, "message": "صيغة طلب تأكيد الحركة غير صالحة."}), 400
    try:
        challenge = get_face_store().consume_challenge(data.get("challenge"))
        if not challenge:
            return jsonify({
                "success": False,
                "message": "انتهت صلاحية تأكيد الوجه أو سبق استخدامه. أعد المسح.",
            }), 410
        now_date = datetime.datetime.now().strftime("%Y-%m-%d")
        if next_attendance_punch_type(challenge["empId"], now_date) != challenge["type"]:
            return jsonify({
                "success": False,
                "message": "تغير سجل الحضور منذ المطابقة. أعد مسح الوجه.",
            }), 409
        punch = build_attendance_punch(
            challenge["empId"],
            challenge["empName"],
            challenge["type"],
            "face_recognition",
            g.auth_claims,
        )
        save_punch(punch)
        return jsonify({"success": True, "message": f"تم تسجيل {punch['typeTitle']} بنجاح.", "punch": punch})
    except DuplicateAttendancePunchError as exc:
        return jsonify({"success": False, "message": str(exc)}), 409
    except FaceSystemUnavailable as exc:
        return jsonify({"success": False, "message": str(exc)}), 503
    except Exception:
        app.logger.exception("Face attendance punch failed")
        return jsonify({"success": False, "message": "تعذر حفظ الحركة. أعد المسح أو أبلغ مدير النظام."}), 500


@app.route("/api/attendance/manual", methods=["POST"])
@require_firebase_auth()
def attendance_manual_api():
    claims = g.auth_claims
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"success": False, "message": "صيغة طلب التسجيل اليدوي غير صالحة."}), 400
    emp_id = str(data.get("empId") or "").strip()[:100]
    punch_type = str(data.get("type") or "").strip().lower()
    reason = str(data.get("reason") or "").strip()[:500]
    if not emp_id or punch_type not in ("in", "out") or len(reason) < 3:
        return jsonify({
            "success": False,
            "message": "اختر الموظف ونوع الحركة واكتب سبباً واضحاً للتسجيل اليدوي.",
        }), 400
    password = str(data.get("password") or "")
    if not password or len(password) > 256:
        return jsonify({"success": False, "message": "أدخل كلمة مرور حسابك لتأكيد التسجيل اليدوي."}), 400
    username = normalized_username(claims.get("username"))
    attempt_key = f"{request.remote_addr or 'unknown'}:attendance-manual:{username}"
    now = time.time()
    with _login_attempts_lock:
        attempts = [timestamp for timestamp in _login_attempts.get(attempt_key, []) if now - timestamp < 300]
        if len(attempts) >= 10:
            return jsonify({"success": False, "message": "محاولات كثيرة. يرجى الانتظار خمس دقائق."}), 429
    storage_error = require_durable_attendance_storage()
    if storage_error:
        return storage_error
    try:
        _, database = get_firebase_admin()
        employees = leaves_employee_records(database)
        employee = next(
            (entry for entry in employees if str(entry.get("id") or "") == emp_id),
            None,
        )
        if not employee:
            return jsonify({"success": False, "message": "الموظف غير موجود في سجل الموظفين."}), 404
        if not attendance_can_manage_employee(claims, employee, employees):
            return jsonify({
                "success": False,
                "message": "التسجيل اليدوي متاح لمدير النظام أو المدير المباشر للموظف فقط.",
            }), 403
        if not verify_attendance_manager_password(username, password, database):
            record_login_failure(attempt_key, now)
            return jsonify({"success": False, "message": "كلمة المرور غير صحيحة."}), 401
        punch = build_attendance_punch(
            emp_id,
            str(employee.get("name") or emp_id)[:120],
            punch_type,
            "manual_override",
            claims,
            reason,
        )
        save_punch(punch)
        return jsonify({"success": True, "message": f"تم تسجيل {punch['typeTitle']} يدوياً.", "punch": punch})
    except DuplicateAttendancePunchError as exc:
        return jsonify({"success": False, "message": str(exc)}), 409
    except Exception:
        app.logger.exception("Manual attendance punch failed")
        return jsonify({"success": False, "message": "تعذر حفظ التسجيل اليدوي."}), 500


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
            newly_paid_cycles = set()
            if collection_key == "payrollDelivery":
                for record_key, record in merged_data.items():
                    previous_record = latest_data.get(record_key)
                    if (
                        isinstance(record, dict)
                        and record.get("isPaid") is True
                        and not (isinstance(previous_record, dict) and previous_record.get("isPaid") is True)
                    ):
                        match = re.match(
                            r"^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})_(.+)$",
                            str(record_key),
                        )
                        if not match:
                            raise PayrollApprovalRequired
                        newly_paid_cycles.add(f"{match.group(1)}_{match.group(2)}")
            elif collection_key == "attendance":
                previous_by_identity = {
                    (str(record.get("empId") or ""), str(record.get("date") or "")): record
                    for record in latest_data
                    if isinstance(record, dict)
                }
                for record in merged_data:
                    if not isinstance(record, dict) or record.get("isPaid") is not True:
                        continue
                    date_value = str(record.get("date") or "")
                    previous_record = previous_by_identity.get(
                        (str(record.get("empId") or ""), date_value)
                    )
                    if isinstance(previous_record, dict) and previous_record.get("isPaid") is True:
                        continue
                    if not valid_iso_date(date_value):
                        raise PayrollApprovalRequired
                    cycle_start, cycle_end = payroll_cycle_for_date(date_value)
                    newly_paid_cycles.add(f"{cycle_start.isoformat()}_{cycle_end.isoformat()}")

            if newly_paid_cycles:
                approval_ref = payroll_approval_document(db)
                cycle_ref = payroll_cycle_document(db)
                approval_snapshot = approval_ref.get(transaction=transaction)
                cycle_snapshot = cycle_ref.get(transaction=transaction)
                approval_document_data = approval_snapshot.to_dict() if approval_snapshot.exists else {}
                cycle_document_data = cycle_snapshot.to_dict() if cycle_snapshot.exists else {}
                if any(
                    not payroll_cycle_approval_is_current(
                        approval_document_data, cycle_document_data, cycle_key
                    )
                    for cycle_key in newly_paid_cycles
                ):
                    raise PayrollApprovalRequired
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
    except PayrollApprovalRequired:
        return jsonify({
            "success": False,
            "message": "لا يمكن تسجيل صرف الراتب قبل اعتماد دورة الراتب من amin elwakil."
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


def attendance_can_manage_employee(claims, employee, employees):
    if leaves_is_admin(claims):
        return True
    actor_id = str(claims.get("empId") or "")
    if not leaves_is_manager(claims) or not actor_id or actor_id == str(employee.get("id") or ""):
        return False
    actor = next((entry for entry in employees if str(entry.get("id") or "") == actor_id), {})
    manager_id = str(employee.get("managerId") or "")
    manager_name = str(employee.get("managerName") or "").strip()
    actor_name = str(claims.get("fullName") or actor.get("name") or "").strip()
    return manager_id == actor_id or bool(manager_name and manager_name == actor_name)


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


def advances_document(db):
    return db.collection("sidi_yaqout_erp").document("employee_advances")


def update_employee_advances(mutator):
    from google.cloud import firestore

    _, db = get_firebase_admin()
    document = advances_document(db)
    transaction = db.transaction(max_attempts=5)

    @firestore.transactional
    def apply_update(txn):
        snapshot = document.get(transaction=txn)
        value = snapshot.to_dict() if snapshot.exists else {}
        current = value.get("list", []) if isinstance(value, dict) else []
        if not isinstance(current, list):
            raise ValueError("Stored employee advances data is invalid")
        result, updated = mutator(current)
        txn.set(document, {"list": updated})
        return result

    return apply_update(transaction)


def payroll_cycle_for_date(value):
    if isinstance(value, str):
        value = datetime.datetime.strptime(value, "%Y-%m-%d").date()
    if value.day >= 25:
        start = value.replace(day=25)
    else:
        previous_month = value.replace(day=1) - datetime.timedelta(days=1)
        start = previous_month.replace(day=25)
    end_month = start.replace(day=28) + datetime.timedelta(days=4)
    end = end_month.replace(day=24)
    return start, end


def next_payroll_cycle(start_date):
    next_month = start_date.replace(day=28) + datetime.timedelta(days=4)
    start = next_month.replace(day=1).replace(day=25)
    end_month = start.replace(day=28) + datetime.timedelta(days=4)
    end = end_month.replace(day=24)
    return start, end


def payroll_approval_date(approved_at):
    return approved_at.astimezone(ZoneInfo("Africa/Cairo")).date()


def build_advance_installment_schedule(amount, installment_count, approval_date):
    cycle_start, _ = payroll_cycle_for_date(approval_date)
    cycle_start, _ = next_payroll_cycle(cycle_start)
    remaining_cents = round(amount * 100)
    base_cents = remaining_cents // installment_count
    schedule = []
    for index in range(installment_count):
        installment_cents = (
            remaining_cents if index == installment_count - 1 else base_cents
        )
        remaining_cents -= installment_cents
        start, end = payroll_cycle_for_date(cycle_start)
        schedule.append({
            "cycleKey": f"{start.isoformat()}_{end.isoformat()}",
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
            "amount": installment_cents / 100,
        })
        cycle_start, _ = next_payroll_cycle(start)
    return schedule


def valid_iso_date(value):
    try:
        parsed = datetime.datetime.strptime(str(value), "%Y-%m-%d").date()
        return parsed.isoformat() == value
    except (TypeError, ValueError):
        return False


def payroll_approval_cycle(start_value, end_value):
    if not valid_iso_date(start_value) or not valid_iso_date(end_value):
        return None
    start_date = datetime.date.fromisoformat(start_value)
    end_date = datetime.date.fromisoformat(end_value)
    if start_date.day != 25 or end_date.day != 24:
        return None
    expected_start, expected_end = payroll_cycle_for_date(start_date)
    if expected_start != start_date or expected_end != end_date:
        return None
    return f"{start_value}_{end_value}"


def payroll_approval_document(db):
    return db.collection("sidi_yaqout_erp").document("payrollApprovals")


def payroll_cycle_document(db):
    return db.collection("sidi_yaqout_erp").document("payrollCycles")


def payroll_cycle_approval_is_current(approval_document_data, cycle_document_data, cycle_key):
    approvals = approval_document_data.get("data", {}) if isinstance(approval_document_data, dict) else {}
    saved_cycles = cycle_document_data.get("data", {}) if isinstance(cycle_document_data, dict) else {}
    if not isinstance(approvals, dict) or not isinstance(saved_cycles, dict):
        return False
    approval = approvals.get(cycle_key)
    saved_cycle = saved_cycles.get(cycle_key)
    return (
        isinstance(approval, dict)
        and approval.get("status") == "approved"
        and isinstance(saved_cycle, dict)
        and bool(saved_cycle.get("savedAt"))
        and approval.get("cycleSavedAt") == saved_cycle.get("savedAt")
    )


class PayrollApprovalRequired(Exception):
    pass


@app.route("/api/payroll-approvals", methods=["GET", "POST"])
@require_firebase_auth()
def payroll_approvals_api():
    claims = g.auth_claims
    data = request.args if request.method == "GET" else request.get_json(silent=True)
    if not hasattr(data, "get"):
        return jsonify({"success": False, "message": "بيانات اعتماد دورة الراتب غير صالحة."}), 400
    start_date = str(data.get("startDate") or "")
    end_date = str(data.get("endDate") or "")
    cycle_key = payroll_approval_cycle(start_date, end_date)
    if not cycle_key:
        return jsonify({"success": False, "message": "دورة الراتب غير صالحة؛ يجب أن تكون من يوم 25 إلى يوم 24."}), 400

    username = normalized_username(claims.get("username"))
    if request.method == "POST":
        if claims.get("role") != "admin" or username != "amin elwakil":
            return jsonify({"success": False, "message": "اعتماد الرواتب متاح لحساب amin elwakil فقط."}), 403
    elif claims.get("role") != "admin" and claims.get("role") != "employee" and not any(
        (claims.get("screenAccess") or {}).get(screen) in ("view", "edit")
        for screen in ("screen-payroll-summary", "screen-payroll-delivery", "screen-employee-sarki")
    ):
        return jsonify({"success": False, "message": "ليست لديك صلاحية عرض حالة اعتماد الرواتب."}), 403

    try:
        _, db = get_firebase_admin()
        approval_snapshot = payroll_approval_document(db).get()
        approval_data = approval_snapshot.to_dict() if approval_snapshot.exists else {}
        approvals = approval_data.get("data", {}) if isinstance(approval_data, dict) else {}
        if not isinstance(approvals, dict):
            raise ValueError("Stored payroll approvals have an invalid format")

        cycle_snapshot = payroll_cycle_document(db).get()
        cycle_document_data = cycle_snapshot.to_dict() if cycle_snapshot.exists else {}
        saved_cycles = cycle_document_data.get("data", {}) if isinstance(cycle_document_data, dict) else {}
        saved_cycle = saved_cycles.get(cycle_key) if isinstance(saved_cycles, dict) else None
        if request.method == "GET":
            approval = approvals.get(cycle_key)
            if (
                not payroll_cycle_approval_is_current(approval_data, cycle_document_data, cycle_key)
            ):
                approval = None
            return jsonify({"success": True, "approval": approval})

        if not isinstance(saved_cycle, dict) or not saved_cycle.get("savedAt"):
            return jsonify({"success": False, "message": "احفظ مسير دورة الراتب على السحابة أولاً قبل طلب الاعتماد."}), 409

        approval = approvals.get(cycle_key)
        is_new_approval = (
            not isinstance(approval, dict)
            or approval.get("cycleSavedAt") != saved_cycle.get("savedAt")
        )
        if is_new_approval:
            approved_at = datetime.datetime.now(datetime.timezone.utc)
            approval = {
                "status": "approved",
                "startDate": start_date,
                "endDate": end_date,
                "approvedAt": approved_at.isoformat(),
                "approvedBy": str(claims.get("fullName") or claims.get("username") or "")[:120],
                "approvedByUsername": username,
                "calculationSource": saved_cycle.get("calculationSource", ""),
                "cycleSavedAt": saved_cycle.get("savedAt", ""),
            }
            approvals[cycle_key] = approval
            payroll_approval_document(db).set({"data": approvals})

        notify_at = datetime.datetime.fromisoformat(
            approval["approvedAt"].replace("Z", "+00:00")
        ) + datetime.timedelta(minutes=90)
        employees = leaves_employee_records(db)
        notification_items = []
        for employee in employees:
            employee_id = str(employee.get("id") or "")
            if not employee_id or employee.get("status") == "انتهت خدمته":
                continue
            notification_items.append({
                "id": f"payroll-approved:{cycle_key}:{employee_id}",
                "type": "payroll_approved",
                "title": "تم اعتماد سركي الراتب",
                "message": f"تم اعتماد سركي راتب الفترة من {start_date} إلى {end_date}. يمكنك الاطلاع عليه من شاشة سركي الموظف.",
                "targetEmpId": employee_id,
                "targetUsername": None,
                "targetRole": None,
                "senderName": approval["approvedBy"],
                "relatedId": cycle_key,
                "actionScreen": "screen-employee-sarki",
                "createdAt": notify_at.isoformat(),
                "availableAt": notify_at.isoformat(),
                "isRead": False,
            })

        if notification_items:
            def append_payroll_notifications(current):
                if is_new_approval:
                    current[:] = [
                        item for item in current
                        if not (
                            item.get("type") == "payroll_approved"
                            and item.get("relatedId") == cycle_key
                        )
                    ]
                existing_ids = {item.get("id") for item in current if isinstance(item, dict)}
                new_items = [item for item in notification_items if item["id"] not in existing_ids]
                current[0:0] = new_items
                return None, current

            update_server_notifications(append_payroll_notifications)

        return jsonify({"success": True, "approval": approval})
    except Exception:
        app.logger.exception("Payroll approval operation failed")
        return jsonify({"success": False, "message": "تعذر تحميل أو حفظ اعتماد دورة الراتب."}), 500


@app.route("/api/advances", methods=["GET", "POST"])
@require_firebase_auth()
def employee_advances_api():
    claims = g.auth_claims
    try:
        _, db = get_firebase_admin()
        employees = leaves_employee_records(db)

        if request.method == "GET":
            snapshot = advances_document(db).get()
            value = snapshot.to_dict() if snapshot.exists else {}
            records = value.get("list", []) if isinstance(value, dict) else []
            if not isinstance(records, list):
                raise ValueError("Stored employee advances data is invalid")
            visible = []
            for item in records:
                if not isinstance(item, dict):
                    continue
                employee = next(
                    (entry for entry in employees if str(entry.get("id") or "") == str(item.get("empId") or "")),
                    None,
                )
                if leaves_is_admin(claims) or (
                    str(item.get("empId") or "") == str(claims.get("empId") or "")
                ) or (
                    employee and attendance_can_manage_employee(claims, employee, employees)
                ):
                    visible.append(item)
            visible.sort(key=lambda item: str(item.get("createdAt") or ""), reverse=True)
            return jsonify({"success": True, "items": visible})

        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"success": False, "message": "صيغة طلب السلفة غير صالحة."}), 400
        emp_id = str(claims.get("empId") or "").strip()
        employee = next(
            (entry for entry in employees if str(entry.get("id") or "") == emp_id),
            None,
        )
        if not emp_id or not employee:
            return jsonify({"success": False, "message": "حسابك غير مرتبط بموظف. راجع مدير النظام."}), 403
        try:
            if isinstance(data.get("amount"), bool) or isinstance(data.get("installmentCount"), bool):
                raise ValueError
            amount = round(float(data.get("amount")), 2)
            raw_installment_count = float(data.get("installmentCount"))
            if not math.isfinite(raw_installment_count) or not raw_installment_count.is_integer():
                raise ValueError
            installment_count = int(raw_installment_count)
        except (OverflowError, TypeError, ValueError):
            return jsonify({"success": False, "message": "أدخل مبلغاً وعدداً صحيحاً للأقساط."}), 400
        reason = str(data.get("reason") or "").strip()[:1000]
        if not math.isfinite(amount) or not 1 <= amount <= 1_000_000:
            return jsonify({"success": False, "message": "مبلغ السلفة يجب أن يكون بين 1 و1,000,000 جنيه."}), 400
        if not 1 <= installment_count <= 60:
            return jsonify({"success": False, "message": "عدد الأقساط يجب أن يكون بين شهر و60 شهراً."}), 400
        if len(reason) < 3:
            return jsonify({"success": False, "message": "اكتب سبباً واضحاً لطلب السلفة."}), 400

        item = {
            "id": f"advance_{uuid.uuid4().hex}",
            "empId": emp_id,
            "empName": str(employee.get("name") or "")[:120],
            "empUsername": str(employee.get("username") or "")[:120],
            "managerId": str(employee.get("managerId") or ""),
            "managerName": str(employee.get("managerName") or "")[:120],
            "managerUsername": str(employee.get("managerUsername") or "")[:120],
            "amount": amount,
            "installmentCount": installment_count,
            "installmentAmount": round(amount / installment_count, 2),
            "reason": reason,
            "status": "pending",
            "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "submittedBy": str(claims.get("fullName") or claims.get("username") or "")[:120],
            "submittedByUsername": normalized_username(claims.get("username")),
            "schedule": [],
        }

        def append_item(current):
            current.insert(0, item)
            return item, current

        saved_item = update_employee_advances(append_item)
        return jsonify({"success": True, "item": saved_item}), 201
    except Exception:
        app.logger.exception("Employee advance request failed")
        return jsonify({"success": False, "message": "تعذر حفظ طلب السلفة."}), 500


@app.route("/api/advances/installments", methods=["GET"])
@require_firebase_auth()
def payroll_advance_installments_api():
    claims = g.auth_claims
    screen_access = claims.get("screenAccess") or {}
    is_employee = claims.get("role") == "employee"
    if not leaves_is_admin(claims) and not any(
        screen_access.get(screen) in allowed
        for screen, allowed in (
            ("screen-payroll-summary", ("view", "edit")),
            ("screen-punches-payroll", ("view", "edit")),
            ("screen-single-sarki", ("view", "edit")),
            ("screen-bulk-payslips", ("view", "edit")),
            ("screen-employee-sarki", ("view", "edit")),
        )
    ) and not is_employee:
        return jsonify({"success": False, "message": "ليست لديك صلاحية عرض خصومات أقساط السلف للرواتب."}), 403
    start_date = request.args.get("startDate", "")
    end_date = request.args.get("endDate", "")
    if (
        not valid_iso_date(start_date)
        or not valid_iso_date(end_date)
        or end_date < start_date
    ):
        return jsonify({"success": False, "message": "فترة دورة الراتب غير صالحة."}), 400
    try:
        _, db = get_firebase_admin()
        value = advances_document(db).get().to_dict() or {}
        records = value.get("list", []) if isinstance(value, dict) else []
        if not isinstance(records, list):
            raise ValueError("Stored employee advances data is invalid")
        installments = []
        for loan in records:
            if not isinstance(loan, dict) or loan.get("status") != "approved":
                continue
            if is_employee and str(loan.get("empId") or "") != str(claims.get("empId") or ""):
                continue
            for installment in loan.get("schedule", []):
                if (
                    isinstance(installment, dict)
                    and installment.get("startDate") == start_date
                    and installment.get("endDate") == end_date
                ):
                    installments.append({
                        "advanceId": loan.get("id"),
                        "empId": loan.get("empId"),
                        "amount": installment.get("amount", 0),
                    })
        return jsonify({"success": True, "installments": installments})
    except Exception:
        app.logger.exception("Payroll advance installments could not be loaded")
        return jsonify({"success": False, "message": "تعذر تحميل أقساط السلف للدورة المحددة."}), 500


@app.route("/api/advances/<advance_id>/decision", methods=["POST"])
@require_firebase_auth()
def employee_advance_decision_api(advance_id):
    claims = g.auth_claims
    screen_access = claims.get("screenAccess") or {}
    if not leaves_is_admin(claims) and screen_access.get("screen-leaves-permissions") != "edit":
        return jsonify({"success": False, "message": "تحتاج صلاحية تعديل شاشة الإجازات والأذونات لاعتماد السلفة."}), 403
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or data.get("decision") not in ("approve", "reject"):
        return jsonify({"success": False, "message": "قرار السلفة غير صالح."}), 400
    decision = data["decision"]
    actor_name = str(claims.get("fullName") or claims.get("username") or "")[:120]
    decision_at = datetime.datetime.now(datetime.timezone.utc)
    try:
        _, db = get_firebase_admin()
        employees = leaves_employee_records(db)

        def decide(current):
            loan = next(
                (entry for entry in current if isinstance(entry, dict) and str(entry.get("id")) == advance_id),
                None,
            )
            if not loan:
                raise LookupError("طلب السلفة غير موجود.")
            if loan.get("status") != "pending":
                raise ValueError("تم اتخاذ قرار بشأن طلب السلفة بالفعل.")
            employee = next(
                (entry for entry in employees if str(entry.get("id") or "") == str(loan.get("empId") or "")),
                None,
            )
            if not employee or not attendance_can_manage_employee(claims, employee, employees):
                raise PermissionError("اعتماد السلفة متاح للأدمن أو المدير المباشر للموظف فقط.")
            loan["status"] = "approved" if decision == "approve" else "rejected"
            loan["approvedBy" if decision == "approve" else "rejectedBy"] = actor_name
            loan["approvedAt" if decision == "approve" else "rejectedAt"] = decision_at.isoformat()
            if decision == "approve":
                approval_date = payroll_approval_date(decision_at)
                loan["schedule"] = build_advance_installment_schedule(
                    float(loan["amount"]),
                    int(loan["installmentCount"]),
                    approval_date,
                )
            else:
                loan["rejectionReason"] = str(data.get("reason") or "").strip()[:1000]
                loan["schedule"] = []
            return loan, current

        saved_loan = update_employee_advances(decide)
        return jsonify({"success": True, "item": saved_loan})
    except LookupError as exc:
        return jsonify({"success": False, "message": str(exc)}), 404
    except PermissionError as exc:
        return jsonify({"success": False, "message": str(exc)}), 403
    except ValueError as exc:
        return jsonify({"success": False, "message": str(exc)}), 409
    except Exception:
        app.logger.exception("Employee advance decision failed")
        return jsonify({"success": False, "message": "تعذر حفظ قرار السلفة."}), 500


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

        if request.method in ("PUT", "DELETE") and not leaves_is_admin(claims):
            return jsonify({"success": False, "message": "هذه العملية متاحة لمدير النظام فقط."}), 403

        if request.method == "POST" and not leaves_is_admin(claims) and screen_access.get("screen-leaves-permissions") != "edit":
            return jsonify({"success": False, "message": "تحتاج صلاحية تعديل لتقديم الطلب."}), 403

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
            "submittedByUsername": normalized_username(claims.get("username")),
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
    if not leaves_is_admin(claims) and screen_access.get("screen-leaves-permissions") != "edit":
        return jsonify({"success": False, "message": "تحتاج صلاحية تعديل لاعتماد أو رفض الطلب."}), 403

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
    _, db = get_firebase_admin()
    snapshot = db.collection("sidi_yaqout_erp").document("notifications").get()
    if not snapshot.exists:
        return load_legacy_server_notifications()
    value = snapshot.to_dict() or {}
    notifications = value.get("list", [])
    if not isinstance(notifications, list) or any(not isinstance(item, dict) for item in notifications):
        raise ValueError("Stored notification data has an invalid format")
    return notifications[:300]


def load_legacy_server_notifications():
    if not os.path.exists(NOTIFICATIONS_FILE):
        return []
    with open(NOTIFICATIONS_FILE, "r", encoding="utf-8") as source:
        notifications = json.load(source)
    if not isinstance(notifications, list) or any(not isinstance(item, dict) for item in notifications):
        raise ValueError("Legacy notification store has an invalid format")
    return notifications[:300]


def update_server_notifications(mutator):
    from google.cloud import firestore

    _, db = get_firebase_admin()
    document = db.collection("sidi_yaqout_erp").document("notifications")
    transaction = db.transaction(max_attempts=5)

    @firestore.transactional
    def apply_update(txn):
        snapshot = document.get(transaction=txn)
        if snapshot.exists:
            value = snapshot.to_dict() or {}
            current = value.get("list", [])
        else:
            current = load_legacy_server_notifications()
        if not isinstance(current, list) or any(not isinstance(item, dict) for item in current):
            raise ValueError("Stored notification data has an invalid format")
        result, updated = mutator(current)
        txn.set(document, {"list": updated[:300]})
        return result, updated[:300]

    return apply_update(transaction)


def notification_is_available(notification, now):
    available_at = notification.get("availableAt")
    if not available_at:
        return True
    try:
        parsed = datetime.datetime.fromisoformat(str(available_at).replace("Z", "+00:00"))
    except ValueError:
        return False
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=datetime.timezone.utc)
    return parsed <= now


def notifications_for_current_user(notifications):
    claims = g.auth_claims
    now = datetime.datetime.now(datetime.timezone.utc)
    notifications = [
        notification for notification in notifications
        if isinstance(notification, dict) and notification_is_available(notification, now)
    ]
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
        elif target_role == role or (
            target_role == "manager" and (is_manager or role in ("manager", "supervisor"))
        ):
            visible.append(notification)
    return visible


def build_leave_event_notification(claims, db, event_type, related_id):
    snapshot = leaves_permissions_document(db).get()
    value = snapshot.to_dict() if snapshot.exists else {}
    records = value.get("list", []) if isinstance(value, dict) else []
    if not isinstance(records, list):
        raise ValueError("Stored leaves and permissions data is invalid")
    item = next((
        record for record in records
        if isinstance(record, dict) and str(record.get("id")) == related_id
    ), None)
    if not item:
        raise LookupError("الطلب المرتبط بالإشعار غير موجود.")

    event_item_type = "leave" if event_type.startswith("leave_") else "permission"
    if item.get("itemType") != event_item_type:
        raise ValueError("نوع الإشعار لا يطابق الطلب.")
    employee_records = leaves_employee_records(db)
    employee = next((
        record for record in employee_records
        if str(record.get("id") or "") == str(item.get("empId") or "")
    ), None)
    actor_username = normalized_username(claims.get("username"))
    is_request_event = event_type.endswith("_request")

    if is_request_event:
        submitted_by = normalized_username(item.get("submittedByUsername"))
        actor_can_submit = submitted_by == actor_username if submitted_by else bool(
            employee and leaves_can_manage_employee(claims, employee, employee_records)
        )
        if item.get("status") != "pending" or not actor_can_submit:
            raise PermissionError("لا تملك صلاحية إرسال إشعار لهذا الطلب.")
        title = "طلب إجازة جديد" if event_item_type == "leave" else "طلب إذن جديد"
        if event_item_type == "leave":
            detail = (
                f"طلب {item.get('leaveTypeTitle') or 'إجازة'} من "
                f"{item.get('startDate') or ''} إلى {item.get('endDate') or ''}."
            )
        else:
            detail = f"طلب {item.get('permTypeTitle') or 'إذن'} يوم {item.get('startDate') or ''}."
        targets = {"targetUsername": "admin", "targetRole": "manager", "targetEmpId": None}
    else:
        decision = "approved" if event_type.endswith("_approved") else "rejected"
        if item.get("status") != decision:
            raise ValueError("حالة الطلب لا تطابق الإشعار.")
        if not leaves_is_admin(claims):
            screen_access = claims.get("screenAccess") or {}
            if (
                screen_access.get("screen-leaves-permissions") != "edit"
                or not employee
                or not leaves_can_manage_employee(claims, employee, employee_records, allow_self=False)
            ):
                raise PermissionError("لا تملك صلاحية إرسال إشعار لهذا القرار.")
        title = "تمت الموافقة على طلبك" if decision == "approved" else "تم رفض طلبك"
        request_label = item.get("leaveTypeTitle") if event_item_type == "leave" else item.get("permTypeTitle")
        detail = f"تم تحديث طلب {request_label or event_item_type}."
        if decision == "rejected":
            detail += f" السبب: {item.get('rejectionReason') or 'اعتذار لظروف العمل'}"
        targets = {
            "targetUsername": None,
            "targetRole": None,
            "targetEmpId": str(item.get("empId") or "")
        }

    return {
        "id": f"leave-event:{related_id}:{event_type}",
        "type": event_type,
        "title": title,
        "message": detail[:2000],
        **targets,
        "senderName": str(claims.get("fullName") or claims.get("username") or "النظام")[:120],
        "relatedId": related_id,
        "actionScreen": "screen-leaves-permissions",
        "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "isRead": False
    }


@app.route("/api/notifications/sync", methods=["GET", "POST"])
@require_firebase_auth()
def notifications_sync_api():
    """Return only authorized notifications; clients can only mark visible ones read."""
    try:
        if request.method == "GET":
            current = load_server_notifications()
            return jsonify({"success": True, "notifications": notifications_for_current_user(current)})

        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"success": False, "message": "بيانات مزامنة الإشعارات غير صالحة."}), 400

        if data.get("action") == "sync-read":
            incoming = data.get("notifications")
            if (
                not isinstance(incoming, list)
                or len(incoming) > 100
                or any(
                    not isinstance(item, dict)
                    or not isinstance(item.get("id"), str)
                    or not 0 < len(item["id"]) <= 200
                    or not isinstance(item.get("isRead"), bool)
                    for item in incoming
                )
            ):
                return jsonify({"success": False, "message": "قائمة تحديثات الإشعارات غير صالحة."}), 400
            read_ids = {item["id"] for item in incoming if item["isRead"]}

            def mark_visible_read(current):
                for notification in current:
                    if (
                        notification.get("id") in read_ids
                        and notifications_for_current_user([notification])
                    ):
                        notification["isRead"] = True
                return None, current

            _, updated = update_server_notifications(mark_visible_read)
            return jsonify({
                "success": True,
                "notifications": notifications_for_current_user(updated)
            })

        if data.get("action") == "event":
            event_type = data.get("type")
            related_id = data.get("relatedId")
            if event_type not in {
                "leave_request", "permission_request",
                "leave_approved", "permission_approved",
                "leave_rejected", "permission_rejected"
            }:
                return jsonify({"success": False, "message": "نوع الإشعار غير مسموح."}), 400
            if not isinstance(related_id, str) or not 0 < len(related_id) <= 200:
                return jsonify({"success": False, "message": "معرف الطلب غير صالح."}), 400
            _, db = get_firebase_admin()
            notification = build_leave_event_notification(
                g.auth_claims, db, event_type, related_id
            )
            notification_id = notification["id"]

            def append_event(current):
                if not any(item.get("id") == notification_id for item in current):
                    current.insert(0, notification)
                current.sort(key=lambda item: str(item.get("createdAt") or ""), reverse=True)
                return None, current

            _, updated = update_server_notifications(append_event)
            return jsonify({
                "success": True,
                "notifications": notifications_for_current_user(updated)
            }), 201

        return jsonify({"success": False, "message": "عملية مزامنة الإشعارات غير مدعومة."}), 400
    except LookupError as exc:
        return jsonify({"success": False, "message": str(exc)}), 404
    except PermissionError as exc:
        return jsonify({"success": False, "message": str(exc)}), 403
    except ValueError as exc:
        return jsonify({"success": False, "message": str(exc)}), 409
    except Exception:
        app.logger.exception("Notifications API failed")
        return jsonify({"success": False, "message": "تعذرت مزامنة الإشعارات بأمان."}), 500


# ── النسخ الاحتياطي التلقائي واسترجاع البيانات (Server Backup System) ──
BACKUPS_DIR = os.path.join(RAILWAY_VOLUME_MOUNT_PATH or BASE_DIR, "backups")
LEGACY_BACKUPS_DIR = os.path.join(BASE_DIR, "backups")
LATEST_BACKUP_FILE = os.path.join(BACKUPS_DIR, "latest_backup.json")


def ensure_backups_dir():
    os.makedirs(BACKUPS_DIR, exist_ok=True)


def backup_storage_is_durable():
    return not os.environ.get("RAILWAY_ENVIRONMENT") or bool(RAILWAY_VOLUME_MOUNT_PATH)


def write_json_atomically(path, data):
    directory = os.path.dirname(path) or "."
    os.makedirs(directory, exist_ok=True)
    file_descriptor, temporary_path = tempfile.mkstemp(prefix=".backup-", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(file_descriptor, "w", encoding="utf-8") as backup_file:
            json.dump(data, backup_file, ensure_ascii=False, separators=(",", ":"))
            backup_file.flush()
            os.fsync(backup_file.fileno())
        os.replace(temporary_path, path)
    finally:
        if os.path.exists(temporary_path):
            os.remove(temporary_path)


def write_punch_database_backup(path):
    directory = os.path.dirname(path) or "."
    os.makedirs(directory, exist_ok=True)
    file_descriptor, temporary_path = tempfile.mkstemp(prefix=".punches-", suffix=".sqlite3", dir=directory)
    os.close(file_descriptor)
    try:
        with PUNCHES_LOCK, open_punch_database() as source:
            destination = sqlite3.connect(temporary_path, timeout=30)
            try:
                source.backup(destination)
            finally:
                destination.close()
        file_descriptor = os.open(temporary_path, os.O_RDWR)
        try:
            os.fsync(file_descriptor)
        finally:
            os.close(file_descriptor)
        os.replace(temporary_path, path)
    finally:
        if os.path.exists(temporary_path):
            os.remove(temporary_path)


def restore_punch_database_backup(path):
    with PUNCHES_LOCK, open_punch_database() as connection:
        connection.execute("ATTACH DATABASE ? AS backup_snapshot", (path,))
        check = connection.execute("PRAGMA backup_snapshot.quick_check").fetchone()
        if not check or check[0] != "ok":
            raise ValueError("Punch backup failed SQLite integrity verification")
        tables = {
            row[0] for row in connection.execute(
                "SELECT name FROM backup_snapshot.sqlite_master WHERE type = 'table'"
            ).fetchall()
        }
        if not {"punches", "imported_punch_sources"}.issubset(tables):
            raise ValueError("Punch backup is missing required tables")
        connection.execute("BEGIN IMMEDIATE")
        connection.execute("DELETE FROM punches")
        connection.execute("DELETE FROM imported_punch_sources")
        connection.execute(
            "INSERT INTO punches (punch_id, sort_timestamp, emp_id, punch_date, payload) "
            "SELECT punch_id, sort_timestamp, emp_id, punch_date, payload "
            "FROM backup_snapshot.punches"
        )
        connection.execute(
            "INSERT INTO imported_punch_sources (path) "
            "SELECT path FROM backup_snapshot.imported_punch_sources"
        )
        connection.execute("DELETE FROM attendance_punch_guard")
        restored_rows = connection.execute(
            "SELECT emp_id, punch_date, payload FROM punches"
        ).fetchall()
        for emp_id, punch_date, payload in restored_rows:
            punch = json.loads(payload)
            if (
                punch.get("source") in ("face_recognition", "manual_override")
                and punch.get("status") in ("ACCEPTED", "MANUAL_ACCEPTED")
            ):
                connection.execute(
                    "INSERT OR IGNORE INTO attendance_punch_guard "
                    "(emp_id, punch_date, punch_type) VALUES (?, ?, ?)",
                    (emp_id, punch_date, str(punch.get("type") or "")),
                )

        connection.execute("DELETE FROM face_challenges")
        if "face_templates" in tables:
            backup_face_columns = {
                row[1] for row in connection.execute(
                    "PRAGMA backup_snapshot.table_info(face_templates)"
                ).fetchall()
            }
            required_face_columns = {
                "emp_id", "employee_name", "nonce", "encrypted_template", "updated_at", "updated_by"
            }
            if required_face_columns.issubset(backup_face_columns):
                consented_at_column = (
                    "consented_at" if "consented_at" in backup_face_columns else "updated_at"
                )
                connection.execute("DELETE FROM face_templates")
                connection.execute(
                    "INSERT INTO face_templates "
                    "(emp_id, employee_name, nonce, encrypted_template, updated_at, updated_by, consented_at) "
                    f"SELECT emp_id, employee_name, nonce, encrypted_template, updated_at, updated_by, {consented_at_column} "
                    "FROM backup_snapshot.face_templates"
                )
        count = connection.execute("SELECT COUNT(*) FROM punches").fetchone()[0]
        connection.commit()
    return count


def server_backup_candidates():
    candidates = []
    directories = {BACKUPS_DIR, LEGACY_BACKUPS_DIR}
    for directory in directories:
        if not os.path.isdir(directory):
            continue
        for filename in os.listdir(directory):
            if filename == "latest_backup.json" or (
                filename.startswith("backup_") and filename.endswith(".json")
            ):
                path = os.path.join(directory, filename)
                if os.path.isfile(path):
                    candidates.append(path)
    return candidates


def latest_versioned_server_backup():
    candidates = [
        path for path in server_backup_candidates()
        if os.path.basename(path).startswith("backup_")
        and os.path.basename(path).endswith(".json")
    ]
    return max(candidates, key=os.path.getmtime) if candidates else None


def punch_backup_path_for_server_backup(backup_path):
    match = re.fullmatch(r"backup_(\d{8}_\d{6}_\d{6})\.json", os.path.basename(backup_path))
    if not match:
        return None
    backup_directory = os.path.dirname(backup_path)
    return os.path.join(backup_directory, f"punches_backup_{match.group(1)}.sqlite3")


def latest_server_backup_with_punches_snapshot():
    candidates = []
    for path in server_backup_candidates():
        if not path.startswith(os.path.join(BACKUPS_DIR, "backup_")) or not path.endswith(".json"):
            continue
        snapshot_path = punch_backup_path_for_server_backup(path)
        if snapshot_path and os.path.isfile(snapshot_path):
            candidates.append(path)
    return max(candidates, key=os.path.getmtime) if candidates else None


@app.route("/api/backup/save", methods=["POST"])
@require_firebase_auth(admin_only=True)
def save_server_backup_api():
    """Persist an atomic backup on durable storage without deleting prior snapshots."""
    if not backup_storage_is_durable():
        return jsonify({
            "success": False,
            "message": "حفظ النسخ الاحتياطية متوقف حتى ربط Railway Volume دائم."
        }), 503
    try:
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or not isinstance(data.get("data"), dict):
            return jsonify({"success": False, "message": "صيغة النسخة الاحتياطية غير صالحة."}), 400

        ensure_backups_dir()
        now = datetime.datetime.now(datetime.timezone.utc)
        timestamp_str = now.strftime("%Y%m%d_%H%M%S_%f")
        filename = f"backup_{timestamp_str}.json"
        filepath = os.path.join(BACKUPS_DIR, filename)

        write_punch_database_backup(
            os.path.join(BACKUPS_DIR, f"punches_backup_{timestamp_str}.sqlite3")
        )
        write_json_atomically(filepath, data)
        write_json_atomically(LATEST_BACKUP_FILE, data)

        return jsonify({
            "success": True,
            "filename": filename,
            "timestamp": now.astimezone().strftime("%Y-%m-%d %H:%M:%S"),
            "message": "تم حفظ النسخة الاحتياطية بنجاح على السيرفر! 💾"
        }), 200
    except Exception:
        app.logger.exception("Saving server backup failed")
        return jsonify({"success": False, "message": "تعذر حفظ النسخة الاحتياطية؛ لم يتم تأكيد نجاح الحفظ."}), 500


@app.route("/api/backup/latest", methods=["GET"])
@require_firebase_auth(admin_only=True)
def get_latest_server_backup_api():
    """استرجاع أحدث نسخة احتياطية محفوظة على السيرفر"""
    if not backup_storage_is_durable():
        return jsonify({
            "success": False,
            "message": "استرجاع النسخ الاحتياطية متوقف حتى ربط Railway Volume دائم."
        }), 503
    try:
        candidates = server_backup_candidates()
    except OSError:
        app.logger.exception("Listing server backup files failed")
        return jsonify({"success": False, "message": "تعذر فحص ملفات النسخ الاحتياطية."}), 500
    if not candidates:
        return jsonify({
            "success": False,
            "message": "لا توجد أي نسخ احتياطية محفوظة على السيرفر حتى الآن."
        }), 404

    try:
        latest_path = latest_versioned_server_backup() or max(candidates, key=os.path.getmtime)
        with open(latest_path, "r", encoding="utf-8") as f:
            backup_data = json.load(f)

        mtime = os.path.getmtime(latest_path)
        mod_date = datetime.datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")

        punch_snapshot_path = punch_backup_path_for_server_backup(latest_path)
        return jsonify({
            "success": True,
            "filename": os.path.basename(latest_path),
            "punchesSnapshotAvailable": bool(punch_snapshot_path and os.path.isfile(punch_snapshot_path)),
            "lastModified": mod_date,
            "backup": backup_data,
            "message": f"تم جلب آخر نسخة احتياطية بنجاح (تاريخ: {mod_date})"
        }), 200
    except Exception:
        app.logger.exception("Reading latest server backup failed")
        return jsonify({"success": False, "message": "تعذر قراءة أحدث نسخة احتياطية."}), 500


@app.route("/api/backup/punches/restore-latest", methods=["POST"])
@require_firebase_auth(admin_only=True)
def restore_latest_server_punch_backup_api():
    if not backup_storage_is_durable():
        return jsonify({
            "success": False,
            "message": "استعادة سجل البصمات متوقفة حتى ربط Railway Volume دائم."
        }), 503
    try:
        backup_path = latest_server_backup_with_punches_snapshot()
        if not backup_path:
            return jsonify({"success": False, "message": "لا توجد نسخة خادم تحتوي على لقطة مستقلة لسجل البصمات."}), 404
        punch_backup_path = punch_backup_path_for_server_backup(backup_path)
        if not punch_backup_path or not os.path.isfile(punch_backup_path):
            return jsonify({"success": False, "message": "النسخة المحددة لا تحتوي على نسخة مستقلة لسجل البصمات."}), 404
        count = restore_punch_database_backup(punch_backup_path)
        return jsonify({"success": True, "count": count, "message": "تم استعادة سجل البصمات والتحقق من سلامة قاعدة البيانات."})
    except (OSError, sqlite3.Error, ValueError):
        app.logger.exception("Restoring server punch backup failed")
        return jsonify({"success": False, "message": "تعذرت استعادة سجل البصمات؛ لم يتم تأكيد نجاح الاستعادة."}), 500


@app.route("/api/backup/list", methods=["GET"])
@require_firebase_auth(admin_only=True)
def list_server_backups_api():
    """عرض قائمة النسخ الاحتياطية المتاحة على السيرفر"""
    if not backup_storage_is_durable():
        return jsonify({
            "success": False,
            "message": "عرض النسخ الاحتياطية متوقف حتى ربط Railway Volume دائم."
        }), 503
    try:
        backups = []
        for filepath in server_backup_candidates():
            fname = os.path.basename(filepath)
            if not (fname.startswith("backup_") and fname.endswith(".json")):
                continue
            mtime = os.path.getmtime(filepath)
            backups.append({
                "filename": fname,
                "date": datetime.datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S"),
                "sizeKb": round(os.path.getsize(filepath) / 1024, 1)
            })
        backups.sort(key=lambda backup: (backup["date"], backup["filename"]), reverse=True)
        return jsonify({"success": True, "backups": backups})
    except OSError:
        app.logger.exception("Listing server backup files failed")
        return jsonify({"success": False, "message": "تعذر قراءة قائمة النسخ الاحتياطية."}), 500



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
