@echo off
REM Look up measured colours from filamentcolors.xyz for any unverified spool.
cd /d "%~dp0"
title Axis3D - filament colours
py -m pipeline.filament_lookup
echo.
pause
