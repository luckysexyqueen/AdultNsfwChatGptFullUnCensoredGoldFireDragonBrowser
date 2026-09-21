@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
set "NODE_EXE="
for %%P in (node.exe) do if not defined NODE_EXE set "NODE_EXE=%%~$PATH:P"
if not defined NODE_EXE if exist "C:\nodejs\node.exe" set "NODE_EXE=C:\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE_EXE=%LocalAppData%\Programs\nodejs\node.exe"
if not defined NODE_EXE echo Node.js NOT FOUND & pause & exit /b 1
for %%I in ("%NODE_EXE%") do set "NODE_DIR=%%~dpI"
set "PATH=%NODE_DIR%;%PATH%"
set "NPM_CMD=%NODE_DIR%npm.cmd"
echo Node: %NODE_EXE%
echo npm : %NPM_CMD%
"%NODE_EXE%" --version
if exist "%NPM_CMD%" (
  "%ComSpec%" /d /s /c ""%NPM_CMD%" --version"
) else (
  echo npm.cmd NOT FOUND
  pause
  exit /b 1
)
echo.
echo npm launcher OK.
pause
