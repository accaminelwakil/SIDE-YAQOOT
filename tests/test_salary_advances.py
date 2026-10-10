import datetime
import unittest
from unittest.mock import patch

import server


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


if __name__ == "__main__":
    unittest.main()
