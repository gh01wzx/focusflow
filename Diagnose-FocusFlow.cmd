@echo off
setlocal
cd /d "%~dp0"
set "FOCUSFLOW_DIAGNOSTIC_EXE=%~dp0FocusFlow.exe"
if exist "%FOCUSFLOW_DIAGNOSTIC_EXE%" (
  powershell.exe -NoProfile -NonInteractive -Command "$diagFile = Get-Item -LiteralPath $env:FOCUSFLOW_DIAGNOSTIC_EXE; Write-Host ('Version: ' + $diagFile.VersionInfo.ProductVersion); Write-Host ('Executable SHA256: ' + (Get-FileHash -LiteralPath $diagFile.FullName -Algorithm SHA256).Hash); $diagProcess = Start-Process -FilePath $diagFile.FullName -ArgumentList '--diagnose' -PassThru -WindowStyle Hidden; if (-not $diagProcess.WaitForExit(20000)) { Stop-Process -Id $diagProcess.Id -ErrorAction SilentlyContinue; Write-Host 'Runtime-only check timed out. Stop repeated launches and retain this build information.'; exit 1 }; $diagHex = '{0:X8}' -f ([uint32]($diagProcess.ExitCode -band [long]4294967295)); Write-Host ('Runtime-only exit: 0x' + $diagHex); if ($diagProcess.ExitCode -ne 0) { Write-Host 'The runtime failed. Stop repeated launches. This code alone does not prove a permissions or runtime-file cause.'; exit 1 }; Write-Host 'Runtime check passed. No task data was opened by this check.'; exit 0"
) else (
  call npm run diagnose
)
set "diagResult=%errorlevel%"
if /I not "%~1"=="--no-pause" pause
exit /b %diagResult%
