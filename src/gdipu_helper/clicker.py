from __future__ import annotations

import re
import time
from dataclasses import dataclass
from urllib.parse import urlparse

from playwright.sync_api import Browser, Frame, Locator, Page, sync_playwright

ALLOWED_HOST = "study.gdipu.edu.cn"
BUTTON_TEXT = re.compile(r"^\s*(报名|立即报名)\s*$")


@dataclass(frozen=True)
class ClickResult:
    code: str
    message: str


class SignupClicker:
    """Connect to the existing WebView2 and send at most one mouse click."""

    def __init__(self, cdp_port: int, wait_seconds: float = 15.0):
        self.cdp_url = f"http://127.0.0.1:{cdp_port}"
        self.wait_seconds = wait_seconds

    def run(self, *, title: str, target_url: str) -> ClickResult:
        with sync_playwright() as playwright:
            browser = playwright.chromium.connect_over_cdp(self.cdp_url, timeout=8_000)
            try:
                page = self._school_page(browser)
                if page is None:
                    return ClickResult("no_page", "未找到学校活动页面，未执行点击。")
                if not self._contains_title(page, title):
                    if self._allowed_url(target_url):
                        page.goto(target_url, wait_until="domcontentloaded", timeout=12_000)
                    if not self._wait_for_title(page, title, 8.0):
                        return ClickResult("wrong_activity", "当前页面不是已预约活动，未执行点击。")
                locator = self._wait_for_button(page)
                if locator is None:
                    return ClickResult("button_unavailable", "15 秒内未出现可用报名按钮，未执行点击。")
                box = locator.bounding_box(timeout=1_500)
                if not box:
                    return ClickResult("no_bounds", "报名按钮没有可点击区域，未执行点击。")
                x = box["x"] + box["width"] / 2
                y = box["y"] + box["height"] / 2
                # One browser mouse click: move, mouse-down, then mouse-up.
                page.mouse.click(x, y, button="left", click_count=1, delay=45)
                return ClickResult("clicked", "已向报名按钮发送一次鼠标点击，请查看学校页面结果。")
            finally:
                browser.close()

    @staticmethod
    def _school_page(browser: Browser) -> Page | None:
        pages = [page for context in browser.contexts for page in context.pages]
        return next((page for page in pages if SignupClicker._page_is_school(page)), None)

    @staticmethod
    def _page_is_school(page: Page) -> bool:
        try:
            return any(urlparse(frame.url).hostname == ALLOWED_HOST for frame in page.frames)
        except Exception:
            return False

    @staticmethod
    def _allowed_url(url: str) -> bool:
        try:
            return urlparse(url).scheme == "https" and urlparse(url).hostname == ALLOWED_HOST
        except ValueError:
            return False

    @staticmethod
    def _contains_title(page: Page, title: str) -> bool:
        for frame in page.frames:
            try:
                is_detail = frame.locator("body").evaluate(
                    """
                    (body, expectedTitle) => {
                      const copy = body.cloneNode(true);
                      copy.querySelectorAll('#gdipu-assist-root').forEach(node => node.remove());
                      const text = copy.innerText || '';
                      return text.includes(expectedTitle) &&
                        /活动报名时间|报名时间|报名未开始|剩余名额/.test(text);
                    }
                    """,
                    title,
                )
                if is_detail:
                    return True
            except Exception:
                continue
        return False

    def _wait_for_title(self, page: Page, title: str, seconds: float) -> bool:
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if self._contains_title(page, title):
                return True
            time.sleep(0.1)
        return False

    def _wait_for_button(self, page: Page) -> Locator | None:
        deadline = time.monotonic() + self.wait_seconds
        while time.monotonic() < deadline:
            for frame in page.frames:
                button = self._available_button(frame)
                if button is not None:
                    return button
            time.sleep(0.1)
        return None

    @staticmethod
    def _available_button(frame: Frame) -> Locator | None:
        candidates = frame.locator("a,button,[role='button']").filter(has_text=BUTTON_TEXT)
        try:
            for index in range(min(candidates.count(), 20)):
                candidate = candidates.nth(index)
                text = (candidate.inner_text(timeout=500) or "").strip()
                classes = candidate.get_attribute("class", timeout=500) or ""
                if (
                    BUTTON_TEXT.fullmatch(text)
                    and candidate.is_visible(timeout=500)
                    and candidate.is_enabled(timeout=500)
                    and candidate.get_attribute("aria-disabled", timeout=500) != "true"
                    and "disabled" not in classes.casefold()
                ):
                    return candidate
        except Exception:
            return None
        return None

