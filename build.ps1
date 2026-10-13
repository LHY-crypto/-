$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectRoot
& ".\.venv\Scripts\python.exe" -m PyInstaller --noconfirm --clean ".\gdipu_helper.spec"
