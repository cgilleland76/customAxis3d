@echo off
REM Double-click to turn everything in inbox\ into draft products.
cd /d "%~dp0"
title Axis3D - add products

if not exist ".env" (
  echo.
  echo   No .env file found.
  echo   Copy .env.example to .env and paste your Supabase service_role key in.
  echo.
  pause
  exit /b 1
)

dir /b /a "inbox" 2>nul | findstr /v /i "^_" >nul
if errorlevel 1 (
  echo.
  echo   Nothing in the inbox folder.
  echo   Drop a folder holding your .gcode.3mf ^(and photos, product.yml^) into:
  echo     %~dp0inbox
  echo.
  start "" "%~dp0inbox"
  pause
  exit /b 0
)

py -m pipeline.watch --once
echo.
echo   Done. New products are DRAFTS - publish them in Shop tools when ready.
echo.
pause
