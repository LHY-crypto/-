@echo off
REM Source launcher.
REM
REM Why this file exists: README's "dev run" section tells you to run
REM a launcher script by name, but that file was never committed. Without it,
REM `python run.py` from the project root fails with ModuleNotFoundError:
REM gdipu_helper, because the package lives under src\ and it is not
REM pip-installed into the venv.
REM
REM This launcher puts src\ on PYTHONPATH for this process only, then runs
REM run.py. Nothing global is modified.
REM
REM Pure ASCII on purpose: cmd.exe parses .cmd files with the local code page.
setlocal
cd /d "%~dp0"
set "PYTHONPATH=%~dp0src"
set "PYTHONIOENCODING=utf-8"
"%~dp0.venv\Scripts\python.exe" "%~dp0run.py" %*
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo.
  echo [exit code %RC%]
  pause
)
endlocal & exit /b %RC%
