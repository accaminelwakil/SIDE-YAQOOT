import datetime
import unittest
from unittest.mock import patch

import server


class PayrollApprovalApiTests(unittest.TestCase):
    cycle_key = "2026-09-25_2026-10-24"

    class Snapshot:
        def __init__(self, data):
            self.exists = data is not None
            self.data = data

        def to_dict(self):
            return self.data

    class Document:
        def __init__(self, database, name):
            self.database = database
            self.name = name

        def get(self, transaction=None):
            return PayrollApprovalApiTests.Snapshot(self.database.documents.get(self.name))

        def set(self, value):
            self.database.documents[self.name] = value

    class Transaction:
        def __init__(self, database):
            self.database = database

        def set(self, document, value, merge=False):
            if merge:
                current = self.database.documents.get(document.name, {})
                self.database.documents[document.name] = {**current, **value}
            else:
                self.database.documents[document.name] = value

    class Collection:
        def __init__(self, database):
            self.database = database

        def document(self, name):
            return PayrollApprovalApiTests.Document(self.database, name)

    class Database:
        def __init__(self):
            self.documents = {
                "payrollCycles": {
                    "data": {
                        PayrollApprovalApiTests.cycle_key: {
                            "savedAt": "2026-10-10T20:00:00+00:00",
                            "calculationSource": "punch",
                        }
                    }
                }
            }

        def collection(self, _name):
            return PayrollApprovalApiTests.Collection(self)

        def transaction(self):
            return PayrollApprovalApiTests.Transaction(self)

    def setUp(self):
        self.claims = {
            "username": "amin elwakil",
            "fullName": "Amin Elwakil",
            "role": "admin",
        }
        self.database = self.Database()
        self.notifications = []

        class FakeAuth:
            def verify_id_token(_self, _token, app=None, check_revoked=True):
                return self.claims

        class FakeFirebase:
            auth = FakeAuth()

            @staticmethod
            def get_app(_name):
                return _name

        def update_notifications(mutator):
            result, self.notifications = mutator(self.notifications)
            return result, self.notifications

        self.patches = [
            patch("server.get_firebase_admin", return_value=(FakeFirebase(), self.database)),
            patch(
                "server.leaves_employee_records",
                return_value=[
                    {"id": "emp-1", "name": "Employee One"},
                    {"id": "emp-2", "name": "Employee Two", "status": "انتهت خدمته"},
                ],
            ),
            patch("server.update_server_notifications", side_effect=update_notifications),
        ]
        for mocked in self.patches:
            mocked.start()
        self.client = server.app.test_client()
        self.headers = {"Authorization": "Bearer valid-token"}

    def tearDown(self):
        for mocked in reversed(self.patches):
            mocked.stop()

    def test_only_named_admin_can_approve_payroll_cycle(self):
        self.claims["username"] = "other-admin"
        response = self.client.post(
            "/api/payroll-approvals",
            headers=self.headers,
            json={"startDate": "2026-09-25", "endDate": "2026-10-24"},
        )

        self.assertEqual(response.status_code, 403)
        self.assertNotIn("payrollApprovals", self.database.documents)

    def test_approval_schedules_employee_notification_ninety_minutes_later(self):
        response = self.client.post(
            "/api/payroll-approvals",
            headers=self.headers,
            json={"startDate": "2026-09-25", "endDate": "2026-10-24"},
        )

        self.assertEqual(response.status_code, 200)
        approval = response.get_json()["approval"]
        self.assertEqual(approval["status"], "approved")
        self.assertEqual(approval["approvedByUsername"], "amin elwakil")
        self.assertEqual(len(self.notifications), 1)
        approved_at = datetime.datetime.fromisoformat(approval["approvedAt"])
        available_at = datetime.datetime.fromisoformat(self.notifications[0]["availableAt"])
        self.assertEqual(available_at - approved_at, datetime.timedelta(minutes=90))
        self.assertEqual(self.notifications[0]["targetEmpId"], "emp-1")

    def test_changed_payroll_cycle_revision_is_no_longer_approved(self):
        response = self.client.post(
            "/api/payroll-approvals",
            headers=self.headers,
            json={"startDate": "2026-09-25", "endDate": "2026-10-24"},
        )
        self.assertEqual(response.status_code, 200)

        self.database.documents["payrollCycles"]["data"][self.cycle_key]["savedAt"] = "2026-10-10T21:00:00+00:00"
        status = self.client.get(
            "/api/payroll-approvals?startDate=2026-09-25&endDate=2026-10-24",
            headers=self.headers,
        )

        self.assertEqual(status.status_code, 200)
        self.assertIsNone(status.get_json()["approval"])

    def test_future_payroll_notifications_are_not_visible_before_due_time(self):
        now = datetime.datetime.now(datetime.timezone.utc)
        notifications = [
            {"id": "future", "availableAt": (now + datetime.timedelta(minutes=1)).isoformat()},
            {"id": "ready", "availableAt": (now - datetime.timedelta(minutes=1)).isoformat()},
        ]
        with server.app.test_request_context():
            server.g.auth_claims = {"username": "employee-one", "role": "employee", "empId": "emp-1"}
            visible = server.notifications_for_current_user(notifications)

        self.assertEqual([item["id"] for item in visible], ["ready"])

    def test_cloud_sync_rejects_direct_payroll_delivery_without_approval(self):
        cycle_key = self.cycle_key
        delivery_key = f"{cycle_key}_emp-1"
        with patch("google.cloud.firestore.transactional", new=lambda function: function):
            response = self.client.post(
                "/api/firebase/collection/payrollDelivery",
                headers=self.headers,
                json={"baseData": {}, "data": {delivery_key: {"isPaid": True}}},
            )

        self.assertEqual(response.status_code, 409)
        self.assertNotIn("payrollDelivery", self.database.documents)

        self.database.documents["payrollApprovals"] = {
            "data": {
                cycle_key: {
                    "status": "approved",
                    "cycleSavedAt": self.database.documents["payrollCycles"]["data"][cycle_key]["savedAt"],
                }
            }
        }
        with patch("google.cloud.firestore.transactional", new=lambda function: function):
            approved_response = self.client.post(
                "/api/firebase/collection/payrollDelivery",
                headers=self.headers,
                json={"baseData": {}, "data": {delivery_key: {"isPaid": True}}},
            )

        self.assertEqual(approved_response.status_code, 200)
        self.assertTrue(self.database.documents["payrollDelivery"]["data"][delivery_key]["isPaid"])

    def test_cloud_sync_rejects_attendance_paid_flag_without_approval(self):
        with patch("google.cloud.firestore.transactional", new=lambda function: function):
            response = self.client.post(
                "/api/firebase/collection/attendance",
                headers=self.headers,
                json={
                    "baseData": [],
                    "data": [{"empId": "emp-1", "date": "2026-10-01", "isPaid": True}],
                },
            )

        self.assertEqual(response.status_code, 409)
        self.assertNotIn("attendance", self.database.documents)


class SalaryAdvanceApiTests(unittest.TestCase):
    def setUp(self):
        self.claims = {
            "username": "employee-one",
            "fullName": "Employee One",
            "role": "employee",
            "empId": "emp-1",
            "screenAccess": {"screen-employee-sarki": "view"},
        }
        self.employees = [
            {
                "id": "emp-1",
                "name": "Employee One",
                "username": "employee-one",
                "managerId": "manager-1",
                "managerName": "Manager One",
                "managerUsername": "manager-one",
            },
            {
                "id": "emp-2",
                "name": "Employee Two",
                "username": "employee-two",
                "managerId": "manager-2",
                "managerName": "Manager Two",
            },
        ]
        self.advances = []
        self.database = object()
        self.exists = True

        class FakeAuth:
            def verify_id_token(_self, token, app=None, check_revoked=True):
                return self.claims

        class FakeFirebase:
            auth = FakeAuth()

            @staticmethod
            def get_app(name):
                return name

        self.firebase = FakeFirebase()
        self.patches = [
            patch("server.get_firebase_admin", return_value=(self.firebase, self.database)),
            patch("server.leaves_employee_records", side_effect=lambda _db: self.employees),
            patch("server.advances_document", side_effect=lambda _db: self),
            patch("server.update_employee_advances", side_effect=self.update_advances),
        ]
        for mocked in self.patches:
            mocked.start()
        self.client = server.app.test_client()
        self.headers = {"Authorization": "Bearer test-token"}

    def tearDown(self):
        for mocked in reversed(self.patches):
            mocked.stop()

    def to_dict(self):
        return {"list": self.advances}

    def get(self):
        return self

    def update_advances(self, mutator):
        result, self.advances = mutator(self.advances)
        return result

    def test_employee_request_is_bound_to_authenticated_employee(self):
        response = self.client.post(
            "/api/advances",
            headers=self.headers,
            json={
                "empId": "emp-2",
                "amount": 100,
                "installmentCount": 3,
                "reason": "Emergency expenses",
            },
        )

        self.assertEqual(response.status_code, 201)
        item = response.get_json()["item"]
        self.assertEqual(item["empId"], "emp-1")
        self.assertEqual(item["status"], "pending")
        self.assertEqual(item["schedule"], [])
        self.assertEqual(item["managerUsername"], "manager-one")

    def test_employee_can_only_read_their_own_advance_requests(self):
        self.advances = [
            {"id": "a1", "empId": "emp-1", "status": "pending"},
            {"id": "a2", "empId": "emp-2", "status": "pending"},
        ]

        response = self.client.get("/api/advances", headers=self.headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.get_json()["items"]], ["a1"])

    def test_employee_installments_are_limited_to_their_own_salary(self):
        cycle = {"startDate": "2025-03-25", "endDate": "2025-04-24", "amount": 50}
        self.advances = [
            {"id": "a1", "empId": "emp-1", "status": "approved", "schedule": [cycle]},
            {"id": "a2", "empId": "emp-2", "status": "approved", "schedule": [cycle]},
        ]

        response = self.client.get(
            "/api/advances/installments?startDate=2025-03-25&endDate=2025-04-24",
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json()["installments"],
            [{"advanceId": "a1", "empId": "emp-1", "amount": 50}],
        )

    def test_only_direct_manager_can_decide_once(self):
        self.advances = [
            {
                "id": "a1",
                "empId": "emp-1",
                "amount": 100,
                "installmentCount": 2,
                "status": "pending",
            }
        ]
        self.claims.update({
            "username": "manager-one",
            "fullName": "Manager One",
            "role": "supervisor",
            "empId": "manager-1",
            "screenAccess": {"screen-leaves-permissions": "edit"},
        })

        accepted = self.client.post(
            "/api/advances/a1/decision",
            headers=self.headers,
            json={"decision": "approve"},
        )
        duplicate = self.client.post(
            "/api/advances/a1/decision",
            headers=self.headers,
            json={"decision": "reject"},
        )

        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(self.advances[0]["status"], "approved")
        self.assertEqual(len(self.advances[0]["schedule"]), 2)
        self.assertEqual(duplicate.status_code, 409)

    def test_unrelated_manager_cannot_decide_advance(self):
        self.advances = [
            {
                "id": "a1",
                "empId": "emp-1",
                "amount": 100,
                "installmentCount": 2,
                "status": "pending",
            }
        ]
        self.claims.update({
            "username": "manager-two",
            "fullName": "Manager Two",
            "role": "supervisor",
            "empId": "manager-2",
            "screenAccess": {"screen-leaves-permissions": "edit"},
        })

        response = self.client.post(
            "/api/advances/a1/decision",
            headers=self.headers,
            json={"decision": "approve"},
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.advances[0]["status"], "pending")

    def test_invalid_advance_amount_is_rejected(self):
        response = self.client.post(
            "/api/advances",
            headers=self.headers,
            json={"amount": -1, "installmentCount": 1, "reason": "Emergency"},
        )

        self.assertEqual(response.status_code, 400)


class SalaryAdvanceScheduleTests(unittest.TestCase):
    def test_payroll_cycle_changes_on_the_25th(self):
        self.assertEqual(
            server.payroll_cycle_for_date("2025-02-24"),
            (datetime.date(2025, 1, 25), datetime.date(2025, 2, 24)),
        )
        self.assertEqual(
            server.payroll_cycle_for_date("2025-02-25"),
            (datetime.date(2025, 2, 25), datetime.date(2025, 3, 24)),
        )

    def test_approval_date_uses_cairo_local_date(self):
        approved_at = datetime.datetime(2025, 3, 24, 22, 30, tzinfo=datetime.timezone.utc)
        self.assertEqual(
            server.payroll_approval_date(approved_at),
            datetime.date(2025, 3, 25),
        )

    def test_approval_on_cycle_end_starts_schedule_in_next_cycle(self):
        schedule = server.build_advance_installment_schedule(
            100, 3, datetime.date(2025, 3, 24)
        )
        self.assertEqual(
            [(item["startDate"], item["endDate"]) for item in schedule],
            [
                ("2025-03-25", "2025-04-24"),
                ("2025-04-25", "2025-05-24"),
                ("2025-05-25", "2025-06-24"),
            ],
        )

    def test_schedule_reconciles_rounding_remainder_in_last_installment(self):
        schedule = server.build_advance_installment_schedule(
            100, 3, datetime.date(2025, 3, 25)
        )
        self.assertEqual(
            [item["amount"] for item in schedule],
            [33.33, 33.33, 33.34],
        )
        self.assertEqual(round(sum(item["amount"] for item in schedule), 2), 100)

    def test_schedule_handles_year_boundary(self):
        schedule = server.build_advance_installment_schedule(
            60, 2, datetime.date(2025, 12, 31)
        )
        self.assertEqual(
            [(item["startDate"], item["endDate"]) for item in schedule],
            [
                ("2026-01-25", "2026-02-24"),
                ("2026-02-25", "2026-03-24"),
            ],
        )


class PayrollApprovalStateTests(unittest.TestCase):
    def test_approval_is_current_only_for_the_saved_cycle_revision(self):
        approval_data = {
            "data": {
                "2025-03-25_2025-04-24": {
                    "status": "approved",
                    "cycleSavedAt": "2025-04-25T08:00:00+00:00",
                }
            }
        }
        cycle_data = {
            "data": {
                "2025-03-25_2025-04-24": {
                    "savedAt": "2025-04-25T08:00:00+00:00",
                }
            }
        }

        self.assertTrue(server.payroll_cycle_approval_is_current(
            approval_data, cycle_data, "2025-03-25_2025-04-24"
        ))

        cycle_data["data"]["2025-03-25_2025-04-24"]["savedAt"] = "2025-04-25T09:00:00+00:00"
        self.assertFalse(server.payroll_cycle_approval_is_current(
            approval_data, cycle_data, "2025-03-25_2025-04-24"
        ))

    def test_unapproved_or_missing_cycle_cannot_be_paid(self):
        self.assertFalse(server.payroll_cycle_approval_is_current(
            {"data": {}},
            {"data": {"2025-03-25_2025-04-24": {"savedAt": "saved"}}},
            "2025-03-25_2025-04-24",
        ))
        self.assertFalse(server.payroll_cycle_approval_is_current(
            {"data": {"2025-03-25_2025-04-24": {"status": "approved", "cycleSavedAt": "saved"}}},
            {"data": {}},
            "2025-03-25_2025-04-24",
        ))


if __name__ == "__main__":
    unittest.main()
