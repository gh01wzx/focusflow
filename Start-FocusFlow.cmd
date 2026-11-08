@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24.12 or newer in the 24.x series is required to run from source.
  pause
  exit /b 1
)
node -e "const v=process.versions.node.split('.').map(Number);process.exit(v[0]===24 && v[1]>=12 ? 0 : 1)"
if errorlevel 1 (
  echo Please use Node.js 24.12 or a later 24.x version.
  pause
  exit /b 1
)
if not exist node_modules\typescript\bin\tsc (
  call npm ci --no-audit --no-fund
  if errorlevel 1 goto failed
)
if not exist "%LOCALAPPDATA%\FocusFlow\codex-product\runtime\node_modules\@openai\codex\package.json" (
  echo Preparing the official AI runtime. No sign-in or model request is started.
  call npm run ai:install
  if errorlevel 1 echo AI setup was not completed. You can still use local tasks.
)
if /i "%~1"=="--review" (
  if "%~2"=="" (
    call npm run review -- local
  ) else (
    call npm run review -- "%~2"
  )
) else (
  call npm start
)
if errorlevel 1 goto failed
exit /b 0
:failed
echo FocusFlow did not start. Keep this message and your data for troubleshooting.
pause
exit /b 1
