@echo off
cd /d "%~dp0"
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.12 ou plus recent est necessaire pour lancer Flippy.
  pause
  exit /b 1
)
if not exist "node_modules\.bin\vite.cmd" (
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm run dev -- --open
pause
