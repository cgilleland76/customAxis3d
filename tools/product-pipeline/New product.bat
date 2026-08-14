@echo off
REM Guided: pick a sliced file, answer a few prompts, get a draft product.
cd /d "%~dp0"
title Axis3D - new product
if not exist ".env" (
  echo.
  echo   No .env file found. Copy .env.example to .env and paste your
  echo   Supabase service_role key into it first.
  echo.
  pause
  exit /b 1
)
py -m pipeline.new_product
echo.
pause
