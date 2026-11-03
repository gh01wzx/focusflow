@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24.12 or newer in the 24.x series is required for this Phase 0 spike.
  pause
  exit /b 1
)
node src/main.mjs --open
if errorlevel 1 pause
