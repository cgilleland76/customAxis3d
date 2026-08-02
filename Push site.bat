@echo off
REM Double-click to commit everything and push to GitHub. Netlify builds on push.
cd /d "%~dp0"
title Axis3D - push site

if exist ".git\index.lock" (
  echo   Clearing a stale git lock...
  del /q ".git\index.lock"
)

git add -A

git diff --cached --quiet
if not errorlevel 1 (
  echo.
  echo   Nothing to push - everything is already committed.
  echo.
  pause
  exit /b 0
)

echo.
echo   About to commit:
git diff --cached --stat
echo.
set /p MSG="  Describe the change (Enter for a default): "
if "%MSG%"=="" set MSG=Update site

git commit -m "%MSG%"
git push
if errorlevel 1 (
  echo.
  echo   Push failed. If it mentions authentication, sign in to GitHub and retry.
) else (
  echo.
  echo   Pushed. Netlify will rebuild in a minute or two.
  echo   Then hard-refresh the site with Ctrl+Shift+R.
)
echo.
pause
