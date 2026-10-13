import tempfile
import unittest
from pathlib import Path

from gdipu_helper.task_store import TaskStore


class TaskStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = TaskStore(Path(self.temp.name) / "tasks.sqlite3")

    def tearDown(self):
        self.temp.cleanup()

    def test_same_account_and_activity_cannot_be_reserved_twice(self):
        payload = dict(
            account="20260001",
            activity_id="activity-a",
            title="测试活动",
            run_at="2030-01-01T00:00:00+00:00",
            target_url="https://study.gdipu.edu.cn/activity/a",
        )
        created, _ = self.store.reserve(**payload)
        repeated, existing = self.store.reserve(**payload)
        self.assertTrue(created)
        self.assertFalse(repeated)
        self.assertEqual(existing.state, "scheduled")

    def test_other_activity_is_allowed_for_same_account(self):
        common = dict(
            account="20260001",
            title="测试活动",
            run_at="2030-01-01T00:00:00+00:00",
            target_url="https://study.gdipu.edu.cn/activity/a",
        )
        first, _ = self.store.reserve(activity_id="activity-a", **common)
        second, _ = self.store.reserve(activity_id="activity-b", **common)
        self.assertTrue(first)
        self.assertTrue(second)

    def test_claim_is_atomic_and_only_succeeds_once(self):
        self.store.reserve(
            account="20260001",
            activity_id="activity-a",
            title="测试活动",
            run_at="2030-01-01T00:00:00+00:00",
            target_url="https://study.gdipu.edu.cn/activity/a",
        )
        self.assertIsNotNone(self.store.claim("20260001", "activity-a"))
        self.assertIsNone(self.store.claim("20260001", "activity-a"))


if __name__ == "__main__":
    unittest.main()
