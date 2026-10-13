from __future__ import annotations

import hashlib
import sqlite3
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class SignupTask:
    account_key: str
    activity_id: str
    title: str
    run_at: str
    target_url: str
    state: str
    created_at: str
    attempted_at: str | None = None
    result: str | None = None


def account_key(alias: str) -> str:
    normalized = " ".join(alias.strip().casefold().split())
    if not normalized:
        raise ValueError("请输入账号标识。")
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class TaskStore:
    """SQLite task store with a per-account/per-activity uniqueness guard."""

    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        return connection

    @contextmanager
    def _connection(self):
        connection = self._connect()
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connection() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS signup_tasks (
                    account_key TEXT NOT NULL,
                    activity_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    run_at TEXT NOT NULL,
                    target_url TEXT NOT NULL,
                    state TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    attempted_at TEXT,
                    result TEXT,
                    PRIMARY KEY (account_key, activity_id)
                )
                """
            )
            # A crash after claiming may have happened after the mouse event.
            # Never retry such a task automatically.
            connection.execute(
                """
                UPDATE signup_tasks
                SET state = 'unknown', result = COALESCE(result, '程序在执行期间退出；为避免重复点击，任务不会重试。')
                WHERE state = 'claimed'
                """
            )

    def reserve(
        self,
        *,
        account: str,
        activity_id: str,
        title: str,
        run_at: str,
        target_url: str,
    ) -> tuple[bool, SignupTask]:
        key = account_key(account)
        created_at = utc_now()
        with self._connection() as connection:
            existing = connection.execute(
                "SELECT * FROM signup_tasks WHERE account_key = ? AND activity_id = ?",
                (key, activity_id),
            ).fetchone()
            if existing and existing["state"] != "cancelled":
                return False, self._row(existing)
            if existing:
                connection.execute(
                    """
                    UPDATE signup_tasks
                    SET title = ?, run_at = ?, target_url = ?, state = 'scheduled',
                        created_at = ?, attempted_at = NULL, result = NULL
                    WHERE account_key = ? AND activity_id = ? AND state = 'cancelled'
                    """,
                    (title, run_at, target_url, created_at, key, activity_id),
                )
            else:
                connection.execute(
                    """
                    INSERT INTO signup_tasks
                    (account_key, activity_id, title, run_at, target_url, state, created_at)
                    VALUES (?, ?, ?, ?, ?, 'scheduled', ?)
                    """,
                    (key, activity_id, title, run_at, target_url, created_at),
                )
            row = connection.execute(
                "SELECT * FROM signup_tasks WHERE account_key = ? AND activity_id = ?",
                (key, activity_id),
            ).fetchone()
        return True, self._row(row)

    def claim(self, account: str, activity_id: str) -> SignupTask | None:
        key = account_key(account)
        with self._connection() as connection:
            cursor = connection.execute(
                """
                UPDATE signup_tasks SET state = 'claimed', attempted_at = ?
                WHERE account_key = ? AND activity_id = ? AND state = 'scheduled'
                """,
                (utc_now(), key, activity_id),
            )
            if cursor.rowcount != 1:
                return None
            row = connection.execute(
                "SELECT * FROM signup_tasks WHERE account_key = ? AND activity_id = ?",
                (key, activity_id),
            ).fetchone()
        return self._row(row)

    def claim_by_key(self, key: str, activity_id: str) -> SignupTask | None:
        with self._connection() as connection:
            cursor = connection.execute(
                """
                UPDATE signup_tasks SET state = 'claimed', attempted_at = ?
                WHERE account_key = ? AND activity_id = ? AND state = 'scheduled'
                """,
                (utc_now(), key, activity_id),
            )
            if cursor.rowcount != 1:
                return None
            row = connection.execute(
                "SELECT * FROM signup_tasks WHERE account_key = ? AND activity_id = ?",
                (key, activity_id),
            ).fetchone()
        return self._row(row)

    def finish(self, account_key_value: str, activity_id: str, result: str) -> None:
        with self._connection() as connection:
            connection.execute(
                """
                UPDATE signup_tasks SET state = 'attempted', result = ?
                WHERE account_key = ? AND activity_id = ? AND state = 'claimed'
                """,
                (result, account_key_value, activity_id),
            )

    def cancel(self, account: str, activity_id: str) -> bool:
        key = account_key(account)
        with self._connection() as connection:
            cursor = connection.execute(
                """
                UPDATE signup_tasks SET state = 'cancelled', result = '用户在执行前取消。'
                WHERE account_key = ? AND activity_id = ? AND state = 'scheduled'
                """,
                (key, activity_id),
            )
        return cursor.rowcount == 1

    def scheduled(self) -> list[SignupTask]:
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT * FROM signup_tasks WHERE state = 'scheduled' ORDER BY run_at"
            ).fetchall()
        return [self._row(row) for row in rows]

    def list_for_account(self, account: str) -> list[dict[str, Any]]:
        key = account_key(account)
        with self._connection() as connection:
            rows = connection.execute(
                """
                SELECT * FROM signup_tasks WHERE account_key = ?
                ORDER BY created_at DESC LIMIT 30
                """,
                (key,),
            ).fetchall()
        return [asdict(self._row(row)) for row in rows]

    @staticmethod
    def _row(row: sqlite3.Row) -> SignupTask:
        return SignupTask(**dict(row))

