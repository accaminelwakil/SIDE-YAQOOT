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
        with patch(
            "server.leaves_employee_records",
            return_value=[{"id": "emp-1", "name": "Employee One"}],
        ):
            first_response = self.client.post(
                "/api/attendance/manual",
                headers=self.headers,
                json={"empId": "emp-1", "type": "in", "reason": "Camera unavailable"},
            )
            duplicate_response = self.client.post(
                "/api/attendance/manual",
                headers=self.headers,
                json={"empId": "emp-1", "type": "in", "reason": "Duplicate test"},
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
        with patch("server.leaves_employee_records", return_value=[employee]):
            response = self.client.post(
                "/api/attendance/manual",
                headers=self.headers,
                json={"empId": "emp-1", "type": "in", "reason": "Camera unavailable"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["punch"]["source"], "manual_override")


if __name__ == "__main__":
    unittest.main()
