@echo off
setlocal
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS first. See README.md.
  pause
  exit /b 1
)
where cargo >nul 2>nul
if errorlevel 1 (
  echo Install stable Rust and the Visual Studio C++ Build Tools first. See README.md.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm run tauri dev
if errorlevel 1 pause
