@echo off
setlocal
set "PYTHONPATH=%~dp0src"
"%~dp0.venv\Scripts\pythonw.exe" "%~dp0run.py"

