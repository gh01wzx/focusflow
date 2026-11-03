@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24.12 or newer in the 24.x series is required for this Phase 0 spike.
  pause
  exit /b 1
)
if not exist node_modules\typescript\bin\tsc (
  echo Run npm ci once in this folder before launching the TypeScript spike.
  pause
  exit /b 1
)
call npm start
if errorlevel 1 pause
