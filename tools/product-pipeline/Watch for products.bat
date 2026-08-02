@echo off
REM Leave this running. Anything dropped into inbox\ is processed automatically.
cd /d "%~dp0"
title Axis3D - watching inbox
echo   Watching the inbox folder. Close this window to stop.
echo.
py -m pipeline.watch
pause
