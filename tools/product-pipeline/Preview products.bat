@echo off
REM Same as "Add products" but writes nothing to Supabase. Safe to run anytime.
cd /d "%~dp0"
title Axis3D - preview only
py -m pipeline.watch --once --dry-run --force
echo.
echo   Preview only - nothing was uploaded or saved.
echo.
pause
