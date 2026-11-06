@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24.12 or newer in the 24.x series is required.
  pause
  exit /b 1
)
if not exist node_modules\electron\cli.js (
  echo Run npm ci once in this folder before reviewing FocusFlow.
  pause
  exit /b 1
)
set "reviewName=%~1"
if not defined reviewName set "reviewName=local"
call npm run review -- "%reviewName%"
if errorlevel 1 pause
