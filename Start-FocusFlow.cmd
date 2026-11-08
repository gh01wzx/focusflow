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
node -e "for(const p of ['typescript','electron','esbuild','react','react-dom'])require.resolve(p)" >nul 2>nul
if errorlevel 1 (
  call npm ci --no-audit --no-fund
  if errorlevel 1 goto failed
)
node --input-type=module -e "import {resolveCodexCommand} from './src/codex/runtime.ts';import {join} from 'node:path';await resolveCodexCommand(join(process.env.LOCALAPPDATA,'FocusFlow','codex-product','runtime'))" >nul 2>nul
if errorlevel 1 (
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
