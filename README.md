# 广轻活动汇总 Edge v5.0

Windows 活动助手。它在学校“泛在学习平台”的正常网页中增加“帮抢”界面。

## v5.0 帮抢流程

1. 打开程序并完成学校账号登录。
2. 填写一次账号标识，可以使用学号或自己的别名。程序只保存它的 SHA-256 哈希。
3. 点击“读取可预约活动”。程序切换到“活动状态 → 未开始”，逐页读取可预约活动。
4. 在目标活动右侧点击“帮抢”。程序打开详情页，从网页读取报名开始时间并建立一次任务。
5. 到达报名开始时间后，程序通过当前 WebView2 页面向“报名”或“立即报名”按钮发送一次鼠标点击。

同一账号对同一活动只能执行一次；其他活动可以分别建立任务。活动已结束、班级活动以及没有报名开始时间的项目不会建立任务。程序不会刷新活动页、循环重试、调用未公开接口、处理验证码或绕过学校资格限制。

执行前请保持程序、网络、登录状态和电脑正常运行。任务记录保存在用户目录的 SQLite 数据库中；程序异常退出后不会自动重试正在执行的任务，以免发生重复点击。

## 开发运行

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\启动开发版.cmd
```

## 构建 Windows 版本

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\build.ps1
```

输出目录为 `dist/广轻活动汇总-Edge-v5.0/`。发布时需要保留整个目录。

## 目录

- `src/gdipu_helper/overlay.js`：学校活动页中的帮抢界面和活动读取逻辑。
- `src/gdipu_helper/app.py`：WebView2 窗口、调度器和页面接口。
- `src/gdipu_helper/clicker.py`：到点后的单次鼠标点击。
- `src/gdipu_helper/task_store.py`：账号与活动级别的 SQLite 去重记录。
- `research/帮抢功能实现路线.md`：设计和技术路线。
