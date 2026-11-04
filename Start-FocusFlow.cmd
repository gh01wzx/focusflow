@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24.12 or newer in the 24.x series is required to run from source.
  pause
  exit /b 1
)
if not exist node_modules\typescript\bin\tsc (
  echo Run npm ci once in this folder before launching FocusFlow.
  pause
  exit /b 1
)
if not exist node_modules\electron\cli.js (
  echo Run npm ci once in this folder to install the Electron launcher package.
  pause
  exit /b 1
)
if not exist node_modules\esbuild\package.json (
  echo Run npm ci in this folder to install the updated Today interface dependencies.
  pause
  exit /b 1
)
call npm start
if errorlevel 1 pause
