@echo off
setlocal
title GoldFireDragon Ubuntu x64 VM Installer
echo ============================================
echo  GoldFireDragon Ubuntu x64 VM Setup
echo ============================================
echo.
fltmc >nul 2>&1
if errorlevel 1 (
  echo Requesting Administrator privileges...
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
set "SCRIPT=%~dp0install-goldfiredragon-wsl-runner.ps1"
if not exist "%SCRIPT%" (
  echo Installer script is missing. Downloading from GitHub...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/luckysexyqueen/AdultNsfwChatGptFullUnCensoredGoldFireDragonBrowser/HEAD/scripts/install-goldfiredragon-wsl-runner.ps1' -OutFile '%SCRIPT%'"
  if errorlevel 1 (
    echo Download failed. Check network connection.
    pause
    exit /b 1
  )
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
set "RESULT=%ERRORLEVEL%"
echo.
echo Installer exit code: %RESULT%
echo If Windows requires a reboot, restart and run this file again.
pause
exit /b %RESULT%
