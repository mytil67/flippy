@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 ou plus recent est necessaire pour le direct.
  pause
  exit /b 1
)
node serveur.mjs --ouvrir
pause
