# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_all


playwright_datas, playwright_binaries, playwright_hiddenimports = collect_all("playwright")

analysis = Analysis(
    ["run.py"],
    pathex=["src"],
    binaries=playwright_binaries,
    datas=playwright_datas + [("src/gdipu_helper/overlay.js", "gdipu_helper")],
    hiddenimports=playwright_hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(analysis.pure)

exe = EXE(
    pyz,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name="广轻活动汇总-Edge-v5.0",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

bundle = COLLECT(
    exe,
    analysis.binaries,
    analysis.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="广轻活动汇总-Edge-v5.0",
)
