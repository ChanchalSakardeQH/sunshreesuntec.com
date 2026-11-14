@echo off
title Sunshree Suntec - Tally export
echo Make sure Tally is OPEN with the Society company loaded.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Export-TallyData.ps1"
echo.
pause
