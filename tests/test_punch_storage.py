import json
import os
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
        self.paths = (
            patch.object(server, "PUNCHES_FILE", self.legacy_file),
            patch.object(server, "PUNCHES_LOG_FILE", self.log_file),
            patch.object(server, "PUNCHES_PARTITION_DIR", self.partition_dir),
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


if __name__ == "__main__":
    unittest.main()
