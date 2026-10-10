import json
import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

import server


class PunchStorageTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.legacy_file = os.path.join(self.temp_dir.name, "attendance_punches.json")
        self.log_file = os.path.join(self.temp_dir.name, "attendance_punches.jsonl")
        self.partition_dir = os.path.join(self.temp_dir.name, "punches_by_month")
        self.database_file = os.path.join(self.temp_dir.name, "punches.sqlite3")
        self.paths = (
            patch.object(server, "PUNCHES_FILE", self.legacy_file),
            patch.object(server, "PUNCHES_LOG_FILE", self.log_file),
            patch.object(server, "PUNCHES_PARTITION_DIR", self.partition_dir),
            patch.object(server, "PUNCHES_SQLITE_FILE", self.database_file),
        )
        for path_patch in self.paths:
            path_patch.start()

    def tearDown(self):
        for path_patch in reversed(self.paths):
            path_patch.stop()
        self.temp_dir.cleanup()

    def test_appends_without_truncating_history(self):
        legacy = [
            {"id": f"legacy-{index}", "timestamp": f"2026-01-{index % 28 + 1:02d}T00:00:00"}
            for index in range(500)
        ]
        with open(self.legacy_file, "w", encoding="utf-8") as file:
            json.dump(legacy, file)
        with open(self.legacy_file, "r", encoding="utf-8") as file:
            original_legacy_content = file.read()
        for index in range(501):
            punch_date = f"2026-02-{index % 28 + 1:02d}"
            server.save_punch({
                "id": f"new-{index}",
                "date": punch_date,
                "timestamp": f"{punch_date}T00:00:00"
            })

        punches = server.load_punches()
        self.assertEqual(len(punches), 1001)
        self.assertEqual(len({punch["id"] for punch in punches}), 1001)
        with open(self.legacy_file, "r", encoding="utf-8") as file:
            self.assertEqual(file.read(), original_legacy_content)

    def test_corrupt_log_is_reported_instead_of_returning_empty_history(self):
        with open(self.log_file, "w", encoding="utf-8") as file:
            file.write('{"id":"valid"}\nnot-json\n')

        with self.assertRaises(ValueError):
            server.load_punches()

    def test_date_range_pages_return_each_partitioned_record_once(self):
        for index in range(5):
            server.save_punch({
                "id": f"page-{index}",
                "empId": "1001",
                "date": "2026-02-10",
                "time": f"08:0{index}:00",
                "timestamp": f"2026-02-10T08:0{index}:00"
            })

        first = server.load_punches_page("2026-02-01", "2026-02-28", limit=2)
        second = server.load_punches_page("2026-02-01", "2026-02-28", limit=2, cursor=first["nextCursor"])
        third = server.load_punches_page("2026-02-01", "2026-02-28", limit=2, cursor=second["nextCursor"])

        result = first["punches"] + second["punches"] + third["punches"]
        self.assertEqual(len(result), 5)
        self.assertEqual(len({punch["id"] for punch in result}), 5)
        self.assertFalse(third["hasMore"])

    def test_legacy_jsonl_is_imported_once_and_left_unchanged(self):
        record = {
            "id": "legacy-log-1",
            "empId": "1001",
            "date": "2026-02-10",
            "timestamp": "2026-02-10T08:00:00"
        }
        serialized = json.dumps(record, ensure_ascii=False) + "\n"
        with open(self.log_file, "w", encoding="utf-8") as file:
            file.write(serialized)

        self.assertEqual(server.load_punches(), [record])
        self.assertEqual(server.load_punches(), [record])
        with open(self.log_file, "r", encoding="utf-8") as file:
            self.assertEqual(file.read(), serialized)

    def test_database_pages_filter_employee_and_handle_equal_timestamps(self):
        for employee_id in ("1001", "1002"):
            for suffix in ("a", "b", "c"):
                server.save_punch({
                    "id": f"{employee_id}-{suffix}",
                    "empId": employee_id,
                    "date": "2026-02-10",
                    "timestamp": "2026-02-10T08:00:00"
                })

        first = server.load_punches_page(
            "2026-02-01", "2026-02-28", limit=2, employee_id="1001"
        )
        second = server.load_punches_page(
            "2026-02-01", "2026-02-28", limit=2,
            cursor=first["nextCursor"], employee_id="1001"
        )

        records = first["punches"] + second["punches"]
        self.assertEqual({record["empId"] for record in records}, {"1001"})
        self.assertEqual({record["id"] for record in records}, {"1001-a", "1001-b", "1001-c"})
        self.assertFalse(second["hasMore"])

    def test_sqlite_history_indexes_cover_date_and_employee_queries(self):
        with server.open_punch_database() as connection:
            indexes = {
                row[1] for row in connection.execute("PRAGMA index_list(punches)").fetchall()
            }
        self.assertIn("idx_punches_date_order", indexes)
        self.assertIn("idx_punches_employee_date_order", indexes)

    def test_invalid_sqlite_backup_does_not_replace_live_punch_history(self):
        server.save_punch({
            "id": "keep-this",
            "date": "2026-02-10",
            "timestamp": "2026-02-10T08:00:00"
        })
        invalid_backup = os.path.join(self.temp_dir.name, "invalid.sqlite3")
        with open(invalid_backup, "w", encoding="utf-8") as file:
            file.write("not a sqlite database")

        with self.assertRaises(sqlite3.DatabaseError):
            server.restore_punch_database_backup(invalid_backup)

        self.assertEqual([item["id"] for item in server.load_punches()], ["keep-this"])

    def test_attendance_backup_preserves_encrypted_face_templates_and_clears_challenges(self):
        server.save_punch({
            "id": "face-punch",
            "empId": "1001",
            "type": "in",
            "source": "face_recognition",
            "status": "ACCEPTED",
            "date": "2026-02-10",
            "timestamp": "2026-02-10T08:00:00"
        })
        with server.open_punch_database() as connection:
            connection.execute(
                "INSERT INTO face_templates "
                "(emp_id, employee_name, nonce, encrypted_template, updated_at, updated_by, consented_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("1001", "Employee One", b"0123456789ab", b"encrypted-template", "2026-02-10", "admin", "2026-02-10")
            )
            connection.execute(
                "INSERT INTO face_challenges "
                "(token_hash, emp_id, employee_name, punch_type, expires_at) VALUES (?, ?, ?, ?, ?)",
                ("temporary-token", "1001", "Employee One", "out", 2_000_000_000)
            )

        backup = os.path.join(self.temp_dir.name, "punch-backup.sqlite3")
        server.write_punch_database_backup(backup)
        with server.open_punch_database() as connection:
            connection.execute("DELETE FROM face_templates")
            connection.execute(
                "INSERT INTO face_challenges "
                "(token_hash, emp_id, employee_name, punch_type, expires_at) VALUES (?, ?, ?, ?, ?)",
                ("stale-challenge", "1001", "Employee One", "out", 2_000_000_000)
            )

        server.restore_punch_database_backup(backup)
        with server.open_punch_database() as connection:
            template = connection.execute(
                "SELECT encrypted_template FROM face_templates WHERE emp_id = ?",
                ("1001",)
            ).fetchone()
            challenges = connection.execute("SELECT COUNT(*) FROM face_challenges").fetchone()[0]

        self.assertEqual(template[0], b"encrypted-template")
        self.assertEqual(challenges, 0)
        with self.assertRaises(server.DuplicateAttendancePunchError):
            server.save_punch({
                "id": "duplicate-face-punch",
                "empId": "1001",
                "type": "in",
                "source": "face_recognition",
                "status": "ACCEPTED",
                "date": "2026-02-10",
                "timestamp": "2026-02-10T08:01:00"
            })


class EmployeeSelfServiceTests(unittest.TestCase):
    def test_employee_payload_contains_only_own_records_and_profile_fields(self):
        result = server.build_employee_self_service_data(
            "1001",
            [
                {"id": 1001, "name": "Employee One", "basicSalary": 2000, "bankAccount": "private"},
                {"id": 1002, "name": "Employee Two", "basicSalary": 3000}
            ],
            [
                {"empId": 1001, "date": "2026-02-10"},
                {"empId": 1002, "date": "2026-02-10"}
            ],
            {
                "2026-cycle": {
                    "1001": {"additions": 100},
                    "1002": {"additions": 200}
                }
            },
            ["2026-02-10"]
        )

        self.assertEqual(result["employee"], {"id": 1001, "name": "Employee One", "basicSalary": 2000})
        self.assertEqual(result["attendance"], [{"empId": 1001, "date": "2026-02-10"}])
        self.assertEqual(result["salaryAdjustments"], {"2026-cycle": {"1001": {"additions": 100}}})
        self.assertEqual(result["officialHolidays"], ["2026-02-10"])


class ConcurrentSyncMergeTests(unittest.TestCase):
    def test_merges_unrelated_attendance_records_from_two_devices(self):
        base = [{"id": "existing", "empId": 1, "hours": 8}]
        local = base + [{"id": "local", "empId": 2, "hours": 7}]
        latest = base + [{"id": "remote", "empId": 3, "hours": 6}]

        merged = server._merge_sync_values(base, local, latest)

        self.assertEqual({entry["id"] for entry in merged}, {"existing", "local", "remote"})

    def test_rejects_conflicting_changes_to_the_same_attendance_record(self):
        base = [{"id": "base", "empId": 1, "date": "2026-02-10", "hours": 8}]
        local = [{"id": "local", "empId": 1, "date": "2026-02-10", "hours": 7}]
        latest = [{"id": "remote", "empId": 1, "date": "2026-02-10", "hours": 6}]

        with self.assertRaises(server.SyncMergeConflict):
            server._merge_sync_values(base, local, latest)

    def test_merges_different_fields_of_the_same_employee_record(self):
        base = [{"id": "employee-1", "job": "Reception", "basicSalary": 2000}]
        local = [{"id": "employee-1", "job": "Nursing", "basicSalary": 2000}]
        latest = [{"id": "employee-1", "job": "Reception", "basicSalary": 2200}]

        merged = server._merge_sync_values(base, local, latest)

        self.assertEqual(merged, [{"id": "employee-1", "job": "Nursing", "basicSalary": 2200}])

    def test_merges_user_records_by_username(self):
        base = [{"username": "staff-one", "fullName": "Staff", "role": "employee"}]
        local = [{"username": "staff-one", "fullName": "Staff Member", "role": "employee"}]
        latest = [{"username": "staff-one", "fullName": "Staff", "role": "accountant"}]

        merged = server._merge_sync_values(base, local, latest)

        self.assertEqual(merged, [{"username": "staff-one", "fullName": "Staff Member", "role": "accountant"}])


class LeaveAuthorizationTests(unittest.TestCase):
    def setUp(self):
        self.employee_records = [
            {"id": "1001", "name": "Manager", "job": "Nursing"},
            {"id": "1002", "name": "Employee", "job": "Nursing", "managerId": "1001"}
        ]

    def test_employee_can_submit_for_self_but_not_another_employee(self):
        claims = {
            "role": "employee",
            "username": "staff",
            "empId": "1001",
            "screenAccess": {"screen-leaves-permissions": "edit"}
        }
        self.assertTrue(server.leaves_can_manage_employee(claims, self.employee_records[0], self.employee_records))
        self.assertFalse(server.leaves_can_manage_employee(claims, self.employee_records[1], self.employee_records))

    def test_supervisor_can_submit_for_direct_report(self):
        claims = {
            "role": "supervisor",
            "username": "manager",
            "empId": "1001",
            "isManager": True,
            "screenAccess": {"screen-leaves-permissions": "edit"}
        }
        self.assertTrue(server.leaves_can_manage_employee(claims, self.employee_records[1], self.employee_records))
        self.assertFalse(server.leaves_can_manage_employee(
            claims, self.employee_records[0], self.employee_records, allow_self=False
        ))

    def test_employee_can_submit_own_leave_request_through_api(self):
        claims = {
            "role": "employee",
            "username": "staff",
            "fullName": "Staff Member",
            "empId": "1001",
            "screenAccess": {"screen-leaves-permissions": "edit"}
        }
        fake_admin = type("FirebaseAdmin", (), {
            "auth": type("Auth", (), {"verify_id_token": staticmethod(lambda *_args, **_kwargs: claims)})(),
            "get_app": staticmethod(lambda _name: object())
        })()
        with patch.object(server, "get_firebase_admin", return_value=(fake_admin, object())), \
             patch.object(server, "leaves_employee_records", return_value=self.employee_records), \
             patch.object(server, "leaves_permissions_document", return_value=object()), \
             patch.object(server, "update_leaves_permissions", side_effect=lambda mutator: mutator([])[0]):
            response = server.app.test_client().post(
                "/api/leaves-permissions",
                headers={"Authorization": "Bearer test-token"},
                json={
                    "itemType": "leave",
                    "empId": "1001",
                    "leaveType": "annual",
                    "leaveTypeTitle": "Annual",
                    "startDate": "2026-10-20",
                    "endDate": "2026-10-21",
                    "reason": "Family"
                }
            )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json()["item"]["submittedByUsername"], "staff")

    def test_view_only_user_cannot_decide_request(self):
        claims = {
            "role": "supervisor",
            "username": "manager",
            "empId": "1001",
            "isManager": True,
            "screenAccess": {"screen-leaves-permissions": "view"}
        }
        fake_admin = type("FirebaseAdmin", (), {
            "auth": type("Auth", (), {"verify_id_token": staticmethod(lambda *_args, **_kwargs: claims)})(),
            "get_app": staticmethod(lambda _name: object())
        })()
        with patch.object(server, "get_firebase_admin", return_value=(fake_admin, object())):
            response = server.app.test_client().post(
                "/api/leaves-permissions/request-1/decision",
                headers={"Authorization": "Bearer test-token"},
                json={"decision": "approve"}
            )
        self.assertEqual(response.status_code, 403)


class BackupAtomicWriteTests(unittest.TestCase):
    def test_failed_atomic_write_preserves_previous_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "backup.json")
            server.write_json_atomically(path, {"data": {"employees": []}})
            with patch.object(server.json, "dump", side_effect=OSError("disk full")):
                with self.assertRaises(OSError):
                    server.write_json_atomically(path, {"data": {"employees": ["new"]}})
            with open(path, "r", encoding="utf-8") as backup_file:
                self.assertEqual(json.load(backup_file), {"data": {"employees": []}})
            self.assertEqual(os.listdir(directory), ["backup.json"])

    def test_backup_api_writes_to_configured_volume_and_restores_latest(self):
        claims = {"role": "admin", "username": "admin"}
        fake_admin = type("FirebaseAdmin", (), {
            "auth": type("Auth", (), {"verify_id_token": staticmethod(lambda *_args, **_kwargs: claims)})(),
            "get_app": staticmethod(lambda _name: object())
        })()
        with tempfile.TemporaryDirectory() as directory:
            backups_dir = os.path.join(directory, "backups")
            fake_latest = os.path.join(backups_dir, "latest_backup.json")
            with patch.object(server, "get_firebase_admin", return_value=(fake_admin, object())), \
                 patch.object(server, "BACKUPS_DIR", backups_dir), \
                 patch.object(server, "LEGACY_BACKUPS_DIR", os.path.join(directory, "legacy")), \
                 patch.object(server, "LATEST_BACKUP_FILE", fake_latest), \
                 patch.object(server, "PUNCHES_DATA_DIR", directory), \
                 patch.object(server, "PUNCHES_FILE", os.path.join(directory, "legacy-punches.json")), \
                 patch.object(server, "PUNCHES_LOG_FILE", os.path.join(directory, "legacy-punches.jsonl")), \
                 patch.object(server, "PUNCHES_PARTITION_DIR", os.path.join(directory, "punches_by_month")), \
                 patch.object(server, "PUNCHES_SQLITE_FILE", os.path.join(directory, "live-punches.sqlite3")), \
                 patch.object(server, "RAILWAY_VOLUME_MOUNT_PATH", directory), \
                 patch.dict(os.environ, {"RAILWAY_ENVIRONMENT": "production"}):
                server.save_punch({
                    "id": "backup-punch",
                    "date": "2026-02-10",
                    "timestamp": "2026-02-10T08:00:00"
                })
                client = server.app.test_client()
                response = client.post(
                    "/api/backup/save",
                    headers={"Authorization": "Bearer test-token"},
                    json={"metadata": {}, "data": {"employees": [{"id": 1}]}}
                )
                restored = client.get(
                    "/api/backup/latest",
                    headers={"Authorization": "Bearer test-token"}
                )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(restored.status_code, 200)
            self.assertEqual(restored.get_json()["backup"]["data"]["employees"], [{"id": 1}])
            self.assertTrue(restored.get_json()["punchesSnapshotAvailable"])
            with patch.object(server, "get_firebase_admin", return_value=(fake_admin, object())), \
                 patch.object(server, "BACKUPS_DIR", backups_dir), \
                 patch.object(server, "LEGACY_BACKUPS_DIR", os.path.join(directory, "legacy")), \
                 patch.object(server, "PUNCHES_DATA_DIR", directory), \
                 patch.object(server, "PUNCHES_FILE", os.path.join(directory, "legacy-punches.json")), \
                 patch.object(server, "PUNCHES_LOG_FILE", os.path.join(directory, "legacy-punches.jsonl")), \
                 patch.object(server, "PUNCHES_PARTITION_DIR", os.path.join(directory, "punches_by_month")), \
                 patch.object(server, "PUNCHES_SQLITE_FILE", os.path.join(directory, "live-punches.sqlite3")), \
                 patch.object(server, "RAILWAY_VOLUME_MOUNT_PATH", directory), \
                 patch.dict(os.environ, {"RAILWAY_ENVIRONMENT": "production"}):
                server.save_punch({
                    "id": "newer-punch",
                    "date": "2026-02-11",
                    "timestamp": "2026-02-11T08:00:00"
                })
                punches_restored = server.app.test_client().post(
                    "/api/backup/punches/restore-latest",
                    headers={"Authorization": "Bearer test-token"}
                )
                restored_punch_ids = [item["id"] for item in server.load_punches()]
            self.assertEqual(punches_restored.status_code, 200)
            self.assertEqual(punches_restored.get_json()["count"], 1)
            self.assertEqual(restored_punch_ids, ["backup-punch"])
            self.assertEqual(len([name for name in os.listdir(backups_dir) if name.startswith("backup_")]), 1)
            self.assertEqual(len([name for name in os.listdir(backups_dir) if name.startswith("punches_backup_")]), 1)

    def test_backup_api_refuses_to_claim_durability_without_railway_volume(self):
        claims = {"role": "admin", "username": "admin"}
        fake_admin = type("FirebaseAdmin", (), {
            "auth": type("Auth", (), {"verify_id_token": staticmethod(lambda *_args, **_kwargs: claims)})(),
            "get_app": staticmethod(lambda _name: object())
        })()
        with patch.object(server, "get_firebase_admin", return_value=(fake_admin, object())), \
             patch.object(server, "RAILWAY_VOLUME_MOUNT_PATH", None), \
             patch.dict(os.environ, {"RAILWAY_ENVIRONMENT": "production"}):
            response = server.app.test_client().post(
                "/api/backup/save",
                headers={"Authorization": "Bearer test-token"},
                json={"metadata": {}, "data": {"employees": []}}
            )
        self.assertEqual(response.status_code, 503)


class NotificationAuthorizationTests(unittest.TestCase):
    def test_notification_reads_are_scoped_to_user_or_targeted_role(self):
        notifications = [
            {"id": "public", "title": "General"},
            {"id": "own", "targetEmpId": "1001"},
            {"id": "other", "targetEmpId": "1002"},
            {"id": "manager", "targetRole": "manager"}
        ]
        with server.app.test_request_context("/"):
            server.g.auth_claims = {"role": "employee", "username": "staff", "empId": "1001"}
            visible = server.notifications_for_current_user(notifications)
        self.assertEqual({item["id"] for item in visible}, {"public", "own"})

    def test_manager_cannot_create_notification_for_request_submitted_by_other_user(self):
        item = {
            "id": "request-1",
            "itemType": "leave",
            "empId": "1002",
            "status": "pending",
            "submittedByUsername": "someone-else"
        }
        fake_snapshot = type("Snapshot", (), {
            "exists": True,
            "to_dict": lambda self: {"list": [item]}
        })()
        fake_document = type("Document", (), {"get": lambda self: fake_snapshot})()
        fake_db = object()
        claims = {
            "role": "supervisor",
            "username": "manager",
            "empId": "1001",
            "isManager": True,
            "screenAccess": {"screen-leaves-permissions": "edit"}
        }
        with patch.object(server, "leaves_permissions_document", return_value=fake_document), \
             patch.object(server, "leaves_employee_records", return_value=self_employee_records()):
            with self.assertRaises(PermissionError):
                server.build_leave_event_notification(claims, fake_db, "leave_request", "request-1")

    def test_mark_read_updates_only_notifications_visible_to_authenticated_user(self):
        claims = {"role": "employee", "username": "staff", "empId": "1001"}
        fake_admin = type("FirebaseAdmin", (), {
            "auth": type("Auth", (), {"verify_id_token": staticmethod(lambda *_args, **_kwargs: claims)})(),
            "get_app": staticmethod(lambda _name: object())
        })()
        current = [
            {"id": "own", "targetEmpId": "1001", "isRead": False},
            {"id": "other", "targetEmpId": "1002", "isRead": False}
        ]

        def update(mutator):
            _, updated = mutator(current)
            return None, updated

        with patch.object(server, "get_firebase_admin", return_value=(fake_admin, object())), \
             patch.object(server, "update_server_notifications", side_effect=update):
            response = server.app.test_client().post(
                "/api/notifications/sync",
                headers={"Authorization": "Bearer test-token"},
                json={
                    "action": "sync-read",
                    "notifications": [
                        {"id": "own", "isRead": True},
                        {"id": "other", "isRead": True}
                    ]
                }
            )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(current[0]["isRead"])
        self.assertFalse(current[1]["isRead"])
        self.assertEqual([item["id"] for item in response.get_json()["notifications"]], ["own"])


def self_employee_records():
    return [
        {"id": "1001", "name": "Manager", "job": "Nursing"},
        {"id": "1002", "name": "Employee", "job": "Nursing", "managerId": "1001"}
    ]


if __name__ == "__main__":
    unittest.main()
