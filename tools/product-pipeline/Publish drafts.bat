@echo off
REM Show every draft product and choose which to make live.
cd /d "%~dp0"
title Axis3D - publish drafts
py -m pipeline.drafts --publish
echo.
pause
