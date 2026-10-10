import base64
import hashlib
import hmac
import math
import os
import secrets
import sqlite3
import struct
import tempfile
import threading
import time
import urllib.request
from contextlib import contextmanager

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


FACE_MATCH_THRESHOLD = 0.363
FACE_MATCH_MARGIN = 0.05
MAX_IMAGE_BYTES = 2 * 1024 * 1024
CHALLENGE_TTL_SECONDS = 90

MODEL_URLS = {
    "yunet": (
        "https://media.githubusercontent.com/media/opencv/opencv_zoo/"
        "47534e27c9851bb1128ccc0102f1145e27f23f98/models/face_detection_yunet/"
        "face_detection_yunet_2023mar.onnx",
        "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
        232589,
    ),
    "sface": (
        "https://media.githubusercontent.com/media/opencv/opencv_zoo/"
        "25f423d0e04c31a17254620e58febd7386da523b/models/face_recognition_sface/"
        "face_recognition_sface_2021dec.onnx",
        "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
        38696353,
    ),
}

_MODEL_LOCK = threading.RLock()
_INFERENCE_LOCK = threading.Lock()


class FaceAttendanceError(ValueError):
    pass


class FaceSystemUnavailable(RuntimeError):
    pass


class FaceAttendanceStore:
    def __init__(self, database_path, encryption_key):
        if not isinstance(encryption_key, bytes) or len(encryption_key) != 32:
            raise ValueError("Face-template encryption key must be exactly 32 bytes")
        self.database_path = database_path
        self._cipher = AESGCM(encryption_key)
        self._detector = None
        self._recognizer = None
        self._embeddings_for_test = None
        os.makedirs(os.path.dirname(database_path) or ".", exist_ok=True)
        with self._connection() as connection:
            connection.execute(
                "CREATE TABLE IF NOT EXISTS face_templates ("
                "emp_id TEXT PRIMARY KEY, employee_name TEXT NOT NULL, "
                "nonce BLOB NOT NULL, encrypted_template BLOB NOT NULL, "
                "updated_at TEXT NOT NULL, updated_by TEXT NOT NULL, consented_at TEXT NOT NULL)"
            )
            template_columns = {
                row[1] for row in connection.execute("PRAGMA table_info(face_templates)").fetchall()
            }
            if "consented_at" not in template_columns:
                connection.execute(
                    "ALTER TABLE face_templates ADD COLUMN consented_at TEXT NOT NULL DEFAULT ''"
                )
            connection.execute(
                "CREATE TABLE IF NOT EXISTS face_challenges ("
                "token_hash TEXT PRIMARY KEY, emp_id TEXT NOT NULL, "
                "employee_name TEXT NOT NULL, punch_type TEXT NOT NULL, "
                "expires_at INTEGER NOT NULL)"
            )

    @contextmanager
    def _connection(self):
        connection = sqlite3.connect(self.database_path, timeout=30)
        try:
            connection.execute("PRAGMA busy_timeout = 30000")
            connection.execute("PRAGMA journal_mode = WAL")
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    @staticmethod
    def decode_encryption_key(value):
        if not value:
            raise FaceSystemUnavailable(
                "FACE_TEMPLATE_ENCRYPTION_KEY is not configured on the server."
            )
        try:
            key = base64.b64decode(value.encode("ascii"), altchars=b"-_", validate=True)
        except (UnicodeEncodeError, ValueError, base64.binascii.Error) as exc:
            raise FaceSystemUnavailable(
                "FACE_TEMPLATE_ENCRYPTION_KEY must be URL-safe base64."
            ) from exc
        if len(key) != 32:
            raise FaceSystemUnavailable(
                "FACE_TEMPLATE_ENCRYPTION_KEY must decode to exactly 32 bytes."
            )
        return key

    def _model_path(self, name, model_directory):
        url, expected_hash, expected_size = MODEL_URLS[name]
        os.makedirs(model_directory, exist_ok=True)
        path = os.path.join(model_directory, f"{name}.onnx")
        if os.path.isfile(path):
            if os.path.getsize(path) == expected_size and self._file_sha256(path) == expected_hash:
                return path
            os.remove(path)

        with _MODEL_LOCK:
            if os.path.isfile(path):
                if os.path.getsize(path) == expected_size and self._file_sha256(path) == expected_hash:
                    return path
                os.remove(path)

            temporary_path = None
            try:
                digest = hashlib.sha256()
                byte_count = 0
                with urllib.request.urlopen(url, timeout=60) as response:
                    with tempfile.NamedTemporaryFile(
                        mode="wb", dir=model_directory, prefix=f".{name}-", delete=False
                    ) as output:
                        temporary_path = output.name
                        while True:
                            chunk = response.read(1024 * 1024)
                            if not chunk:
                                break
                            byte_count += len(chunk)
                            if byte_count > expected_size:
                                raise FaceSystemUnavailable("Downloaded face model has an invalid size.")
                            digest.update(chunk)
                            output.write(chunk)
                if byte_count != expected_size or not hmac.compare_digest(digest.hexdigest(), expected_hash):
                    raise FaceSystemUnavailable("Downloaded face model failed its integrity check.")
                os.replace(temporary_path, path)
                temporary_path = None
                return path
            except FaceSystemUnavailable:
                raise
            except Exception as exc:
                raise FaceSystemUnavailable(
                    "Face-recognition models are unavailable. Check server connectivity and storage."
                ) from exc
            finally:
                if temporary_path and os.path.exists(temporary_path):
                    os.remove(temporary_path)

    @staticmethod
    def _file_sha256(path):
        digest = hashlib.sha256()
        with open(path, "rb") as model_file:
            for chunk in iter(lambda: model_file.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def _load_models(self, model_directory):
        if self._detector is not None and self._recognizer is not None:
            return
        with _MODEL_LOCK:
            if self._detector is not None and self._recognizer is not None:
                return
            yunet_path = self._model_path("yunet", model_directory)
            sface_path = self._model_path("sface", model_directory)
            try:
                import cv2
            except ImportError as exc:
                raise FaceSystemUnavailable(
                    "Install opencv-contrib-python-headless to enable face attendance."
                ) from exc
            if not hasattr(cv2, "FaceDetectorYN") or not hasattr(cv2, "FaceRecognizerSF"):
                raise FaceSystemUnavailable(
                    "The installed OpenCV build does not include YuNet and SFace support."
                )
            try:
                self._detector = cv2.FaceDetectorYN.create(
                    yunet_path, "", (320, 320), 0.9, 0.3, 5000
                )
                self._recognizer = cv2.FaceRecognizerSF.create(sface_path, "")
            except Exception as exc:
                self._detector = None
                self._recognizer = None
                raise FaceSystemUnavailable("The face-recognition models could not be loaded.") from exc

    def _embedding(self, image_bytes, model_directory):
        if not isinstance(image_bytes, bytes) or not image_bytes or len(image_bytes) > MAX_IMAGE_BYTES:
            raise FaceAttendanceError("صورة الوجه غير صالحة أو أكبر من الحد المسموح.")
        if self._embeddings_for_test is not None:
            return self._embeddings_for_test(image_bytes)

        self._load_models(model_directory)
        try:
            import cv2
            import numpy as np
        except ImportError as exc:
            raise FaceSystemUnavailable("OpenCV and NumPy are required for face attendance.") from exc

        image = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None or image.size == 0:
            raise FaceAttendanceError("تعذر قراءة الصورة المرسلة من الكاميرا.")
        height, width = image.shape[:2]
        if width < 160 or height < 160 or width > 4096 or height > 4096:
            raise FaceAttendanceError("حجم صورة الكاميرا غير مناسب. حاول مرة أخرى.")

        resized = cv2.resize(image, (320, 320), interpolation=cv2.INTER_AREA)
        with _INFERENCE_LOCK:
            self._detector.setInputSize((320, 320))
            _, faces = self._detector.detect(resized)
            if faces is None or len(faces) == 0:
                raise FaceAttendanceError("لم يتم العثور على وجه واضح أمام الكاميرا.")
            if len(faces) != 1:
                raise FaceAttendanceError("يجب أن يظهر وجه موظف واحد فقط أمام الكاميرا.")
            x, y, face_width, face_height = faces[0][:4]
            if face_width < 35 or face_height < 35:
                raise FaceAttendanceError("اقترب من الكاميرا لتحسين دقة التعرف على الوجه.")
            aligned_face = self._recognizer.alignCrop(resized, faces[0])
            embedding = self._recognizer.feature(aligned_face).reshape(-1).astype(np.float32)
        norm = float(np.linalg.norm(embedding))
        if embedding.size != 128 or not math.isfinite(norm) or norm <= 0:
            raise FaceSystemUnavailable("Face-recognition returned an invalid template.")
        return embedding / norm

    @staticmethod
    def _serialize_embedding(embedding):
        values = [float(value) for value in embedding]
        if len(values) != 128 or not all(math.isfinite(value) for value in values):
            raise FaceAttendanceError("Face-recognition returned an invalid template.")
        return b"".join(struct.pack("!f", value) for value in values)

    @staticmethod
    def _deserialize_embedding(serialized):
        if len(serialized) != 512:
            raise FaceSystemUnavailable("A stored face template has an invalid format.")
        return [struct.unpack_from("!f", serialized, offset)[0] for offset in range(0, 512, 4)]

    def enroll(self, emp_id, employee_name, image_bytes, enrolled_by, model_directory):
        embedding = self._embedding(image_bytes, model_directory)
        nonce = secrets.token_bytes(12)
        associated_data = f"face-template:v1:{emp_id}".encode("utf-8")
        encrypted = self._cipher.encrypt(nonce, self._serialize_embedding(embedding), associated_data)
        updated_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        with self._connection() as connection:
            connection.execute(
                "INSERT INTO face_templates "
                "(emp_id, employee_name, nonce, encrypted_template, updated_at, updated_by, consented_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(emp_id) DO UPDATE SET employee_name=excluded.employee_name, "
                "nonce=excluded.nonce, encrypted_template=excluded.encrypted_template, "
                "updated_at=excluded.updated_at, updated_by=excluded.updated_by, "
                "consented_at=excluded.consented_at",
                (
                    emp_id,
                    employee_name,
                    nonce,
                    encrypted,
                    updated_at,
                    enrolled_by,
                    updated_at,
                ),
            )
        return {"empId": emp_id, "empName": employee_name, "updatedAt": updated_at}

    def list_enrollments(self):
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT emp_id, employee_name, updated_at, updated_by "
                "FROM face_templates ORDER BY employee_name COLLATE NOCASE"
            ).fetchall()
        return [
            {"empId": row[0], "empName": row[1], "updatedAt": row[2], "updatedBy": row[3]}
            for row in rows
        ]

    def remove_enrollment(self, emp_id):
        with self._connection() as connection:
            cursor = connection.execute("DELETE FROM face_templates WHERE emp_id = ?", (emp_id,))
        return cursor.rowcount > 0

    def match(self, image_bytes, model_directory):
        embedding = self._embedding(image_bytes, model_directory)
        with self._connection() as connection:
            templates = connection.execute(
                "SELECT emp_id, employee_name, nonce, encrypted_template FROM face_templates"
            ).fetchall()
        if not templates:
            raise FaceAttendanceError("لم يتم تسجيل وجوه الموظفين بعد. اطلب من مدير النظام تسجيل الوجه.")

        matches = []
        for emp_id, employee_name, nonce, encrypted in templates:
            associated_data = f"face-template:v1:{emp_id}".encode("utf-8")
            try:
                serialized = self._cipher.decrypt(nonce, encrypted, associated_data)
            except Exception as exc:
                raise FaceSystemUnavailable("A stored face template could not be decrypted.") from exc
            reference = self._deserialize_embedding(serialized)
            score = sum(left * right for left, right in zip(embedding, reference))
            matches.append((score, emp_id, employee_name))

        matches.sort(reverse=True)
        best_score, best_emp_id, best_name = matches[0]
        second_score = matches[1][0] if len(matches) > 1 else -1.0
        if best_score < FACE_MATCH_THRESHOLD or (
            len(matches) > 1 and best_score - second_score < FACE_MATCH_MARGIN
        ):
            raise FaceAttendanceError("تعذر تأكيد هوية الموظف بدرجة كافية. استخدم التسجيل اليدوي.")
        return best_emp_id, best_name, round(best_score, 4)

    def create_challenge(self, emp_id, employee_name, punch_type):
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
        expires_at = int(time.time()) + CHALLENGE_TTL_SECONDS
        with self._connection() as connection:
            connection.execute("DELETE FROM face_challenges WHERE expires_at < ?", (int(time.time()),))
            connection.execute(
                "INSERT INTO face_challenges "
                "(token_hash, emp_id, employee_name, punch_type, expires_at) VALUES (?, ?, ?, ?, ?)",
                (token_hash, emp_id, employee_name, punch_type, expires_at),
            )
        return token, expires_at

    def consume_challenge(self, token):
        if not isinstance(token, str) or len(token) > 128:
            return None
        token_hash = hashlib.sha256(token.encode("ascii", errors="ignore")).hexdigest()
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT emp_id, employee_name, punch_type, expires_at "
                "FROM face_challenges WHERE token_hash = ?",
                (token_hash,),
            ).fetchone()
            if not row or row[3] < int(time.time()):
                connection.execute("DELETE FROM face_challenges WHERE token_hash = ?", (token_hash,))
                return None
            connection.execute("DELETE FROM face_challenges WHERE token_hash = ?", (token_hash,))
            return {"empId": row[0], "empName": row[1], "type": row[2]}


_singleton_lock = threading.Lock()
_singleton_store = None


def get_face_attendance_store(database_path, encryption_key):
    global _singleton_store
    if _singleton_store is not None:
        return _singleton_store
    with _singleton_lock:
        if _singleton_store is None:
            _singleton_store = FaceAttendanceStore(
                database_path, FaceAttendanceStore.decode_encryption_key(encryption_key)
            )
        return _singleton_store
