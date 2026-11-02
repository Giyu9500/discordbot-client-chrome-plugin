@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  Discord Bot Panel - autostart (Windows)
echo ============================================
echo.
echo 1. Zainstaluj rozszerzenie przez chrome://extensions
 echo 2. Otworz karte panelu i skopiuj ID rozszerzenia
 echo 3. Wklej ID ponizej (32 male litery)
echo.
set /p BOT_PANEL_EXTENSION_ID=ID rozszerzenia: 
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0helper\install-native.ps1" -ExtensionId "%BOT_PANEL_EXTENSION_ID%" -Root "%~dp0"
if errorlevel 1 (echo. & echo Niepowodzenie. Sprawdz komunikat wyzej.) else (echo. & echo Gotowe. Odswiez karte rozszerzenia. Nie uruchamiaj START-PANEL.bat.)
pause
