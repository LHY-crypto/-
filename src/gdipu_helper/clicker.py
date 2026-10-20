from __future__ import annotations

import re
import time
from dataclasses import dataclass
from urllib.parse import urlparse

from playwright.sync_api import Browser, Frame, Locator, Page, sync_playwright

ALLOWED_HOST = "study.gdipu.edu.cn"
# 报名入口的文案随状态变化,实测见过:
#   立即报名     (交互242班,报名开放)
#   报名中       (新生"阅读启航计划"读书分享会第一期 —— 手机端截图,报名开放)
#   报名已截止    (apply-status2,不可点,靠 cursor 过滤掉)
# 旧正则只认「报名」和「立即报名」,所以「报名中」永远匹配不到 —— 这就是
# "页面明明有报名按钮,工具说没有"的直接原因。
BUTTON_TEXT = re.compile(r"^\s*(报名|立即报名|报名中|我要报名|报名参加)\s*$")

# 这个页面是「到点才放按钮」的形态。实测(2026-10-19)详情页原文是:
#     敬请期待
#     剩余 19:05:11
#     2026/10/20 14:30开始
#     举办时间 2026/10/20 14:30:00 —— 16:30:00
# 原来的 /活动报名时间|报名时间|报名未开始|剩余名额/ 四个词一个都匹配不到,
# 于是 _contains_title() 恒为 False,工具永远返回 wrong_activity —— 一次都不会点。
# 这里把实测到的词补进来,并保留旧词以兼容其它活动类型。
PAGE_MARKERS = re.compile(
    r"活动报名时间|报名时间|报名未开始|剩余名额"
    r"|敬请期待|剩余\s*\d+\s*:\s*\d+\s*:\s*\d+"
    r"|\d{4}/\d{1,2}/\d{1,2}\s+\d{1,2}:\d{2}\s*开始"
)

# 点击后页面可能出现的成功标记。命中即认为这次点击生效。
SUCCESS_MARKERS = re.compile(r"已报名|报名成功|已参加|取消报名|已预约")

# 登录态失效时会被重定向到统一身份认证。必须单独识别,
# 否则只会报 wrong_activity,让人以为页面不对,实际是没登录。
LOGIN_MARKERS = re.compile(r"统一身份认证|账号登录|扫码登录|忘记密码")
LOGIN_URL = re.compile(r"/login\b|service=|oauth|sso", re.IGNORECASE)

MAX_ATTEMPTS = 3          # 上界:最多点 3 次
RETRY_DELAY_SECONDS = 2.0  # 两次尝试之间等待


@dataclass(frozen=True)
class ClickResult:
    code: str
    message: str


class SignupClicker:
    """Connect to the existing WebView2 and send bounded mouse clicks.

    只做"人也会做的事":到点后点一下;没生效再点,最多 MAX_ATTEMPTS 次,
    串行、有间隔、成功即停。不刷新页面、不并发、不无限重试。
    """

    def __init__(self, cdp_port: int, wait_seconds: float = 15.0):
        self.cdp_url = f"http://127.0.0.1:{cdp_port}"
        self.wait_seconds = wait_seconds

    def run(self, *, title: str, target_url: str) -> ClickResult:
        """在独立标签页里完成一次点击。

        必须用独立标签页:两个任务同时到点时,调度器是线程池,会真并发;
        如果都复用主窗口那一页,一个在 goto、另一个在检查标题,就会互相打断
        —— 实测 2026-10-20 08:35 两个任务同时执行,一个报
        net::ERR_ABORTED,另一个报 wrong_activity,两个都没点成。
        同浏览器上下文共享登录态,所以新标签页不需要重新登录。
        """
        with sync_playwright() as playwright:
            browser = playwright.chromium.connect_over_cdp(self.cdp_url, timeout=8_000)
            page = None
            try:
                context = browser.contexts[0] if browser.contexts else browser.new_context()
                page = context.new_page()
                if self._allowed_url(target_url):
                    try:
                        page.goto(target_url, wait_until="domcontentloaded", timeout=15_000)
                    except Exception:
                        pass  # SPA 中途重定向也会抛，交给下面的标题判断
                if self._is_login_page(page):
                    return ClickResult(
                        "login_expired",
                        "登录已失效，页面被重定向到统一身份认证。请在程序里重新登录后再建任务。",
                    )
                if not self._wait_for_title(page, title, 10.0):
                    if self._is_login_page(page):
                        return ClickResult(
                            "login_expired",
                            "登录已失效，页面被重定向到统一身份认证。请在程序里重新登录后再建任务。",
                        )
                    return ClickResult("wrong_activity", "详情页 10 秒内没有出现目标活动，未执行点击。")

                last = ClickResult("not_attempted", "没有任何一次尝试。")
                clicks_sent = 0
                for attempt in range(1, MAX_ATTEMPTS + 1):
                    # 第一次等到点后的按钮;后续尝试按钮通常已经在了,等短一点。
                    budget = self.wait_seconds if attempt == 1 else 4.0
                    locator = self._wait_for_button(page, budget)
                    if locator is None:
                        last = ClickResult(
                            "button_unavailable",
                            f"第 {attempt} 次：{budget:.0f} 秒内未出现可用报名按钮，未执行点击。",
                        )
                        if attempt < MAX_ATTEMPTS:
                            time.sleep(RETRY_DELAY_SECONDS)
                        continue

                    box = locator.bounding_box(timeout=1_500)
                    if not box:
                        last = ClickResult(
                            "no_bounds",
                            f"第 {attempt} 次：报名按钮没有可点击区域，未执行点击。",
                        )
                        if attempt < MAX_ATTEMPTS:
                            time.sleep(RETRY_DELAY_SECONDS)
                        continue

                    x = box["x"] + box["width"] / 2
                    y = box["y"] + box["height"] / 2
                    # 一次浏览器鼠标点击：移动、按下、抬起。
                    page.mouse.click(x, y, button="left", click_count=1, delay=45)
                    clicks_sent += 1

                    if self._click_took_effect(page, 1.5):
                        return ClickResult(
                            "clicked",
                            f"第 {attempt} 次点击后检测到报名成功标记（共点击 {clicks_sent} 次）。",
                        )

                    last = ClickResult(
                        "clicked_unverified",
                        f"第 {attempt} 次已点击，但 1.5 秒内未见成功标记（共点击 {clicks_sent} 次）。",
                    )
                    if attempt < MAX_ATTEMPTS:
                        time.sleep(RETRY_DELAY_SECONDS)

                return last
            finally:
                if page is not None:
                    try:
                        page.close()
                    except Exception:
                        pass
                browser.close()

    # ── 页面识别 ───────────────────────────────────────────────
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
    def _is_login_page(page: Page) -> bool:
        """是否被重定向到了统一身份认证。

        登录过期时学校会把任何页面踢到 /login?service=...,此时详情页没有活动标题,
        旧代码只会报 wrong_activity,让人以为页面选错了。必须单独识别。
        """
        try:
            if LOGIN_URL.search(page.url or ""):
                return True
        except Exception:
            pass
        for frame in page.frames:
            try:
                text = frame.locator("body").inner_text(timeout=800) or ""
            except Exception:
                continue
            if LOGIN_MARKERS.search(text):
                return True
        return False

    @staticmethod
    def _contains_title(page: Page, title: str) -> bool:
        """标题命中 + 页面带详情页标记，才算「当前就是目标活动」。

        正则匹配放在 Python 侧：JS 里传普通对象过去没有 .test() 方法，
        那样写会抛异常，等于把原来那个 bug 换成另一个 bug。
        """
        for frame in page.frames:
            try:
                text = frame.locator("body").evaluate(
                    """
                    (body) => {
                      const copy = body.cloneNode(true);
                      copy.querySelectorAll('#gdipu-assist-root').forEach(node => node.remove());
                      return copy.innerText || '';
                    }
                    """
                )
            except Exception:
                continue
            if text and title in text and PAGE_MARKERS.search(text):
                return True
        return False

    def _wait_for_title(self, page: Page, title: str, seconds: float) -> bool:
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if self._contains_title(page, title):
                return True
            time.sleep(0.1)
        return False

    # ── 按钮 ───────────────────────────────────────────────────
    def _wait_for_button(self, page: Page, seconds: float | None = None) -> Locator | None:
        budget = self.wait_seconds if seconds is None else seconds
        deadline = time.monotonic() + budget
        while time.monotonic() < deadline:
            for frame in page.frames:
                button = self._available_button(frame)
                if button is not None:
                    return button
            time.sleep(0.1)
        return None

    @staticmethod
    def _available_button(frame: Frame) -> Locator | None:
        """找可点的报名入口。

        实测(2026-10-20):报名入口是
            <div class="action-apply clickable apply-status7">立即报名</div>
        是 <div>,不是 <button> 也不是 <a>。旧代码只查
        a,button,[role='button'],所以永远找不到,一直报 button_unavailable。
        现在把带 apply/action/btn/button/link 类名的容器也纳入,
        并且 <div> 没有 is_enabled 概念,改用 cursor 和 disabled 类名判断。
        """
        candidates = frame.locator(
            "a,button,[role='button'],.el-button,"
            "[class*='apply'],[class*='action'],[class*='btn'],"
            "[class*='button'],[class*='link']"
        )
        try:
            total = min(candidates.count(), 40)
        except Exception:
            return None
        for index in range(total):
            candidate = candidates.nth(index)
            try:
                text = (candidate.inner_text(timeout=500) or "").strip()
                if not BUTTON_TEXT.fullmatch(text):
                    continue
                if not candidate.is_visible(timeout=500):
                    continue
                classes = (candidate.get_attribute("class", timeout=500) or "").casefold()
                if "disabled" in classes:
                    continue
                if candidate.get_attribute("aria-disabled", timeout=500) == "true":
                    continue
                if candidate.get_attribute("disabled", timeout=500) is not None:
                    continue
                cursor = candidate.evaluate("el => getComputedStyle(el).cursor")
                if cursor in ("not-allowed", "default", "inherit"):
                    # div 靠 cursor:pointer 表明可点;真 button/a 用默认样式也算可点
                    tag = candidate.evaluate("el => el.tagName.toLowerCase()")
                    if tag not in ("a", "button"):
                        continue
                return candidate
            except Exception:
                continue
        return None

    # ── 点击后验证 ─────────────────────────────────────────────
    @staticmethod
    def _click_took_effect(page: Page, seconds: float) -> bool:
        """判断这次点击是否真的生效。

        不能用 SUCCESS_MARKERS 里的「已报名」:详情页本来就写着
        「39人已报名/不限」,点击前就已经命中,于是无论点没点中都会判成功
        —— 这正是"说执行了但没抢到"的来源。

        可靠信号只有「立即报名」这个按钮本身发生变化:文案变成
        取消报名/已报名,或者按钮整个消失。用按钮状态比对,
        而不是在整页文字里找关键词。
        """
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            for frame in page.frames:
                try:
                    still_there = SignupClicker._available_button(frame)
                    if still_there is not None:
                        continue  # 「立即报名」还在,说明没生效
                    text = frame.locator("body").inner_text(timeout=500) or ""
                    # 按钮没了,再看是不是转成了已报名的措辞
                    if re.search(r"取消报名|已报名成功|报名成功|你已报名", text):
                        return True
                except Exception:
                    continue
            time.sleep(0.2)
        return False
