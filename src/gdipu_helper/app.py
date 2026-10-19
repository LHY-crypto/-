from __future__ import annotations

import ctypes
import os
import socket
import tempfile
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import webview
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.date import DateTrigger

from .clicker import ALLOWED_HOST, SignupClicker
from .task_store import SignupTask, TaskStore, account_key

APP_NAME = "广轻活动汇总（Edge）"
SCHOOL_URL = "https://study.gdipu.edu.cn/CloudPortal/CloudSquare"
LOCAL_TIMEZONE = ZoneInfo("Asia/Shanghai")


def storage_dir() -> Path:
    # Reuse the v4.x WebView2 profile so the school's existing login remains
    # available after upgrading to the helper-enabled build.
    name = "GdipuActivityDashboardEdgeV2"
    executable_dir = Path(os.path.abspath(os.path.dirname(os.sys.executable)))
    candidates = [
        Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / name,
        executable_dir / name,
        Path(tempfile.gettempdir()) / name,
    ]
    last_error: OSError | None = None
    for directory in candidates:
        try:
            directory.mkdir(parents=True, exist_ok=True)
            probe = directory / ".write-check"
            probe.write_text("ok", encoding="ascii")
            probe.unlink()
            return directory
        except OSError as error:
            last_error = error
    raise OSError("无法创建程序的本地浏览器数据目录") from last_error


def choose_cdp_port() -> int:
    for port in range(9222, 9243):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            try:
                probe.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise OSError("没有可用的本地 WebView2 调试端口")


def configure_webview_network() -> None:
    """Use a running local proxy when WebView2 cannot reach the school's CDN."""
    if os.environ.get("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"):
        return
    for port in (7897, 7890):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.settimeout(0.15)
            if probe.connect_ex(("127.0.0.1", port)) == 0:
                os.environ["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = (
                    f"--proxy-server=http://127.0.0.1:{port}"
                )
                return


class HelperApi:
    def __init__(self, store: TaskStore, cdp_port: int):
        self.store = store
        self.clicker = SignupClicker(cdp_port)
        self.scheduler = BackgroundScheduler(timezone=LOCAL_TIMEZONE)
        self.scheduler.start()
        self._restore_tasks()

    def schedule_task(self, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            account = str(payload.get("account") or "").strip()
            activity_id = str(payload.get("activityId") or "").strip()
            title = str(payload.get("title") or "").strip()
            target_url = str(payload.get("targetUrl") or "").strip()
            run_at = self._parse_time(str(payload.get("runAt") or ""))
            account_key(account)
            if not activity_id or not title:
                raise ValueError("活动标识或标题缺失。")
            if run_at <= datetime.now(timezone.utc):
                raise ValueError("报名开始时间已经过去。")
            parsed = urlparse(target_url)
            if parsed.scheme != "https" or parsed.hostname != ALLOWED_HOST:
                raise ValueError("活动页面地址不属于学校网站。")
            created, task = self.store.reserve(
                account=account,
                activity_id=activity_id,
                title=title,
                run_at=run_at.isoformat(),
                target_url=target_url,
            )
            if not created:
                return {
                    "ok": False,
                    "duplicate": True,
                    "message": f"该账号已为“{task.title}”建立或执行过帮抢任务。",
                    "state": task.state,
                }
            self._add_job(account, task)
            return {"ok": True, "message": f"已预约：{title}", "state": task.state}
        except Exception as error:
            return {"ok": False, "message": str(error)}

    def cancel_task(self, account: str, activity_id: str) -> dict[str, Any]:
        try:
            cancelled = self.store.cancel(account, activity_id)
            job_id = self._job_id(account_key(account), activity_id)
            try:
                self.scheduler.remove_job(job_id)
            except Exception:
                pass
            return {
                "ok": cancelled,
                "message": "已取消。" if cancelled else "任务已开始或已结束，不能取消。",
            }
        except Exception as error:
            return {"ok": False, "message": str(error)}

    def list_tasks(self, account: str) -> dict[str, Any]:
        try:
            return {"ok": True, "tasks": self.store.list_for_account(account)}
        except Exception as error:
            return {"ok": False, "message": str(error), "tasks": []}

    def shutdown(self) -> None:
        self.scheduler.shutdown(wait=False)

    def _restore_tasks(self) -> None:
        now = datetime.now(timezone.utc)
        for task in self.store.scheduled():
            run_at = datetime.fromisoformat(task.run_at)
            if run_at > now:
                self._add_job_by_key(task.account_key, task)
            elif now - run_at <= timedelta(seconds=10):
                self._add_job_by_key(task.account_key, task, run_at=now)
            else:
                claimed = self._claim_by_key(task)
                if claimed:
                    self.store.finish(task.account_key, task.activity_id, "程序启动时任务已过期，未执行点击。")

    def _add_job(self, account: str, task: SignupTask) -> None:
        self._add_job_by_key(account_key(account), task, account=account)

    def _add_job_by_key(
        self,
        key: str,
        task: SignupTask,
        *,
        account: str | None = None,
        run_at: datetime | None = None,
    ) -> None:
        self.scheduler.add_job(
            self._execute,
            trigger=DateTrigger(run_date=run_at or datetime.fromisoformat(task.run_at)),
            id=self._job_id(key, task.activity_id),
            args=[account, key, task.activity_id],
            replace_existing=True,
            misfire_grace_time=10,
            max_instances=1,
        )

    def _execute(self, account: str | None, key: str, activity_id: str) -> None:
        task = self.store.claim(account, activity_id) if account else self._claim_by_key_id(key, activity_id)
        if task is None:
            return
        try:
            result = self.clicker.run(title=task.title, target_url=task.target_url)
            message = f"{result.code}: {result.message}"
        except Exception as error:
            message = f"clicker_error: {type(error).__name__}: {error}"
        self.store.finish(key, activity_id, message)

    def _claim_by_key(self, task: SignupTask) -> SignupTask | None:
        return self.store.claim_by_key(task.account_key, task.activity_id)

    def _claim_by_key_id(self, key: str, activity_id: str) -> SignupTask | None:
        # Restored jobs no longer have the account alias. Claim atomically by its hash.
        return self.store.claim_by_key(key, activity_id)

    @staticmethod
    def _parse_time(value: str) -> datetime:
        if not value:
            raise ValueError("报名开始时间缺失。")
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=LOCAL_TIMEZONE)
        return parsed.astimezone(timezone.utc)

    @staticmethod
    def _job_id(key: str, activity_id: str) -> str:
        return f"signup:{key}:{activity_id}"


def main() -> None:
    configure_webview_network()
    profile_dir = storage_dir()
    cdp_port = choose_cdp_port()
    webview.settings["REMOTE_DEBUGGING_PORT"] = cdp_port
    store = TaskStore(profile_dir / "signup-tasks.sqlite3")
    api = HelperApi(store, cdp_port)
    overlay = (Path(__file__).with_name("overlay.js")).read_text(encoding="utf-8")
    window = webview.create_window(
        APP_NAME,
        SCHOOL_URL,
        js_api=api,
        width=1560,
        height=940,
        min_size=(1080, 720),
    )

    def install_overlay() -> None:
        def worker() -> None:
            try:
                window.run_js(overlay)
            except Exception:
                pass

        threading.Thread(target=worker, daemon=True).start()

    window.events.loaded += install_overlay
    window.events.closed += api.shutdown
    webview.start(gui="edgechromium", private_mode=False, storage_path=str(profile_dir))


if __name__ == "__main__":
    main()

