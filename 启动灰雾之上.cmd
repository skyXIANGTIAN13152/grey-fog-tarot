@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-local.ps1"
if errorlevel 1 (
    echo.
    echo Could not start Grey Fog Tarot. See the message above and README.md.
    pause
)
endlocal
