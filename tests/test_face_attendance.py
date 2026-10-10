import base64
import os
import tempfile
import unittest
from unittest.mock import patch

import face_attendance
import server


class FaceAttendanceStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = os.path.join(self.temp_dir.name, "attendance.sqlite3")
        self.store = face_attendance.FaceAttendanceStore(self.database_path, b"k" * 32)
        self.embeddings = {
            b"employee-one": [1.0] + [0.0] * 127,
            b"employee-two": [0.0, 1.0] + [0.0] * 126,
            b"unknown": [0.0, 0.0, 1.0] + [0.0] * 125,
        }
        self.store._embeddings_for_test = lambda image: self.embeddings[image]
        self.model_directory = os.path.join(self.temp_dir.name, "models")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_enrollment_encrypts_template_and_matching_returns_only_employee(self):
        self.store.enroll(
            "emp-1", "Employee One", b"employee-one", "manager", self.model_directory
        )
        with self.store._connection() as connection:
            encrypted = connection.execute(
                "SELECT encrypted_template FROM face_templates WHERE emp_id = ?",
                ("emp-1",),
            ).fetchone()[0]

        self.assertNotEqual(encrypted, face_attendance.FaceAttendanceStore._serialize_embedding(
            self.embeddings[b"employee-one"]
        ))
        self.assertEqual(
            self.store.match(b"employee-one", self.model_directory)[:2],
            ("emp-1", "Employee One"),
        )
        with self.assertRaises(face_attendance.FaceAttendanceError):
            self.store.match(b"unknown", self.model_directory)

    def test_challenge_is_short_lived_and_can_only_be_consumed_once(self):
        token, expires_at = self.store.create_challenge("emp-1", "Employee One", "in")
        self.assertGreater(expires_at, 0)
        self.assertEqual(
            self.store.consume_challenge(token),
            {"empId": "emp-1", "empName": "Employee One", "type": "in"},
        )
        self.assertIsNone(self.store.consume_challenge(token))

    def test_expired_challenge_is_rejected(self):
        token, _ = self.store.create_challenge("emp-1", "Employee One", "out")
        with patch.object(face_attendance.time, "time", return_value=10**12):
            self.assertIsNone(self.store.consume_challenge(token))

    def test_encryption_key_must_be_valid_base64_of_32_bytes(self):
        with self.assertRaises(face_attendance.FaceSystemUnavailable):
            face_attendance.FaceAttendanceStore.decode_encryption_key("not-a-key")

    def test_attendance_password_check_uses_the_authenticated_accounts_credential(self):
        password = "Manager password!"
        credentials = server.hash_password(password)

        class Snapshot:
            exists = True

            def __init__(self, value):
                self.value = value

            def to_dict(self):
                return self.value

            def get(self):
                return self

        class Collection:
            def __init__(self, snapshots):
                self.snapshots = snapshots

            def document(self, document_id):
                return self.snapshots[document_id]

        class Database:
            def collection(self, collection_name):
                if collection_name == "sidi_yaqout_erp":
                    return Collection({
                        "users": Snapshot({"list": [{"username": "manager"}]})
                    })
                return Collection({
                    server.auth_user_key("manager"): Snapshot(credentials)
                })

        with patch(
            "server.user_profiles_document",
            side_effect=lambda db: db.collection("sidi_yaqout_erp").document("users"),
        ):
            self.assertTrue(
                server.verify_attendance_manager_password("manager", password, Database())
            )
            self.assertFalse(
                server.verify_attendance_manager_password("manager", "wrong password", Database())
            )
            self.assertFalse(
                server.verify_attendance_manager_password("unknown", password, Database())
            )


class AttendanceFaceApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_file = os.path.join(self.temp_dir.name, "punches.sqlite3")
        self.paths = (
            patch.object(server, "PUNCHES_FILE", os.path.join(self.temp_dir.name, "legacy.json")),
            patch.object(server, "PUNCHES_LOG_FILE", os.path.join(self.temp_dir.name, "legacy.jsonl")),
            patch.object(server, "PUNCHES_PARTITION_DIR", os.path.join(self.temp_dir.name, "monthly")),
            patch.object(server, "PUNCHES_SQLITE_FILE", self.database_file),
            patch.dict(os.environ, {"RAILWAY_ENVIRONMENT": ""}),
        )
        for path_patch in self.paths:
            path_patch.start()
        self.claims = {
            "username": "attendance-manager",
            "fullName": "Attendance Manager",
            "role": "supervisor",
            "empId": "manager-1",
            "screenAccess": {"screen-attendance": "edit"},
        }

        class FakeAuth:
            def verify_id_token(self, token, app=None, check_revoked=True):
                return self_claims

        class FakeFirebase:
            auth = FakeAuth()

            @staticmethod
            def get_app(name):
                return name

        self_claims = self.claims
        self.firebase = FakeFirebase()
        self.auth_patch = patch("server.get_firebase_admin", return_value=(self.firebase, None))
        self.auth_patch.start()
        self.client = server.app.test_client()
        self.headers = {"Authorization": "Bearer test-token"}

    def tearDown(self):
        self.auth_patch.stop()
        for path_patch in reversed(self.paths):
            path_patch.stop()
        self.temp_dir.cleanup()

    def test_legacy_gps_endpoint_is_disabled(self):
        response = self.client.post(
            "/api/attendance/check-in",
            headers=self.headers,
            json={"latitude": 31.2, "longitude": 29.9, "type": "in"},
        )
        self.assertEqual(response.status_code, 410)

    def test_non_object_payloads_are_rejected(self):
        self.assertEqual(
            self.client.post(
                "/api/attendance/face/match",
                headers=self.headers,
                json=["not", "an", "object"],
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.post(
                "/api/attendance/face/punch",
                headers=self.headers,
                json=["not", "an", "object"],
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.post(
                "/api/attendance/manual",
                headers=self.headers,
                json=["not", "an", "object"],
            ).status_code,
            400,
        )
        self.claims["role"] = "admin"
        self.assertEqual(
            self.client.post(
                "/api/attendance/face/enrollments",
                headers=self.headers,
                json=["not", "an", "object"],
            ).status_code,
            400,
        )

    def test_face_match_requires_camera_image_and_creates_single_use_challenge(self):
        class FakeFaceStore:
            def match(self, image, model_directory):
                self_image = image
                if self_image != b"\xff\xd8test":
                    raise AssertionError("Expected only the JPEG request bytes")
                return "emp-1", "Employee One", 0.99

            def create_challenge(self, emp_id, name, punch_type):
                return "one-time-challenge", 2_000_000_000

            def consume_challenge(self, token):
                if token == "one-time-challenge":
                    return {"empId": "emp-1", "empName": "Employee One", "type": "in"}
                return None

        image = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8test").decode("ascii")
        with (
            patch("server.get_face_store", return_value=FakeFaceStore()),
            patch("server.employee_records_by_id", return_value={"emp-1": {"id": "emp-1", "name": "Employee One"}}),
            patch("server.next_attendance_punch_type", return_value="in"),
        ):
            match_response = self.client.post(
                "/api/attendance/face/match",
                headers=self.headers,
                json={"image": image},
            )
            self.assertEqual(match_response.status_code, 200)
            self.assertNotIn("image", match_response.get_json())
            self.assertEqual(match_response.get_json()["type"], "in")

            punch_response = self.client.post(
                "/api/attendance/face/punch",
                headers=self.headers,
                json={"challenge": "one-time-challenge"},
            )

        self.assertEqual(punch_response.status_code, 200)
        punch = punch_response.get_json()["punch"]
        self.assertEqual(punch["source"], "face_recognition")
        self.assertNotIn("latitude", punch)
        self.assertNotIn("image", punch)

    def test_manual_punch_is_audited_and_duplicate_type_is_rejected(self):
        self.claims["role"] = "admin"
        with (
            patch(
                "server.leaves_employee_records",
                return_value=[{"id": "emp-1", "name": "Employee One"}],
            ),
            patch("server.verify_attendance_manager_password", return_value=True),
        ):
            first_response = self.client.post(
                "/api/attendance/manual",
                headers=self.headers,
                json={
                    "empId": "emp-1",
                    "type": "in",
                    "reason": "Camera unavailable",
                    "password": "manager-password",
                },
            )
            duplicate_response = self.client.post(
                "/api/attendance/manual",
                headers=self.headers,
                json={
                    "empId": "emp-1",
                    "type": "in",
                    "reason": "Duplicate test",
                    "password": "manager-password",
                },
            )

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(duplicate_response.status_code, 409)
        punches = server.load_punches()
        self.assertEqual(len(punches), 1)
        self.assertEqual(punches[0]["source"], "manual_override")
        self.assertEqual(punches[0]["recordedBy"], "attendance-manager")
        self.assertEqual(punches[0]["manualReason"], "Camera unavailable")

    def test_direct_supervisor_can_manually_record_their_employee(self):
        self.claims["role"] = "supervisor"
        employee = {"id": "emp-1", "name": "Employee One", "managerId": "manager-1"}
        with (
            patch("server.leaves_employee_records", return_value=[employee]),
            patch("server.verify_attendance_manager_password", return_value=True),
        ):
            response = self.client.post(
                "/api/attendance/manual",
                headers=self.headers,
                json={
                    "empId": "emp-1",
                    "type": "in",
                    "reason": "Camera unavailable",
                    "password": "manager-password",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["punch"]["source"], "manual_override")

    def test_supervisor_cannot_manually_record_an_employee_they_do_not_manage(self):
        self.claims["role"] = "supervisor"
        employees = [
            {"id": "manager-1", "name": "Attendance Manager", "job": "Nursing"},
            {"id": "emp-1", "name": "Employee One", "job": "Nursing", "managerId": "manager-2"},
        ]
        with (
            patch("server.leaves_employee_records", return_value=employees),
            patch("server.verify_attendance_manager_password", return_value=True),
        ):
            response = self.client.post(
                "/api/attendance/manual",
                headers=self.headers,
                json={
                    "empId": "emp-1",
                    "type": "in",
                    "reason": "Camera unavailable",
                    "password": "manager-password",
                },
            )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(server.load_punches(), [])

    def test_manual_punch_requires_the_authenticated_manager_password(self):
        self.claims["role"] = "admin"
        with (
            patch(
                "server.leaves_employee_records",
                return_value=[{"id": "emp-1", "name": "Employee One"}],
            ),
            patch("server.verify_attendance_manager_password", return_value=False),
        ):
            response = self.client.post(
                "/api/attendance/manual",
                headers=self.headers,
                json={
                    "empId": "emp-1",
                    "type": "in",
                    "reason": "Camera unavailable",
                    "password": "wrong-password",
                },
            )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(server.load_punches(), [])

    def test_face_enrollment_is_available_to_direct_manager_only(self):
        self.claims["role"] = "supervisor"
        employee = {"id": "emp-1", "name": "Employee One", "managerId": "manager-1"}

        class FakeFaceStore:
            def enroll(self, emp_id, name, image, enrolled_by, model_directory):
                return {"empId": emp_id, "empName": name}

        with (
            patch("server.get_firebase_admin", return_value=(self.firebase, object())),
            patch("server.leaves_employee_records", return_value=[employee]),
            patch("server.require_durable_attendance_storage", return_value=None),
            patch("server.face_image_from_request", return_value=b"camera-image"),
            patch("server.get_face_store", return_value=FakeFaceStore()),
        ):
            allowed = self.client.post(
                "/api/attendance/face/enrollments",
                headers=self.headers,
                json={"empId": "emp-1", "consentConfirmed": True},
            )
            employee["managerId"] = "someone-else"
            denied = self.client.post(
                "/api/attendance/face/enrollments",
                headers=self.headers,
                json={"empId": "emp-1", "consentConfirmed": True},
            )

        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(denied.status_code, 403)


if __name__ == "__main__":
    unittest.main()
