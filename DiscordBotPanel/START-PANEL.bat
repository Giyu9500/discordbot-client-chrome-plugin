@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Discord Bot Panel - lokalny pomocnik
where node >nul 2>&1
if errorlevel 1 (
  echo BRAK NODE.JS. Zainstaluj Node.js 18 lub nowszy z https://nodejs.org/
  echo Nastepnie uruchom ponownie ten plik.
  pause
  exit /b 1
)
node "helper\server.js"
echo.
echo Pomocnik zakonczyl dzialanie.
pause
