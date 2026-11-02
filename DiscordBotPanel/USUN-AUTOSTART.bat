@echo off
chcp 65001 >nul
echo Usuwanie rejestracji natywnego pomocnika z HKCU...
reg delete "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.discordbotpanel.bridge" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.discordbotpanel.bridge" /f >nul 2>&1
reg delete "HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.discordbotpanel.bridge" /f >nul 2>&1
echo Usunieto rejestracje (jesli byla obecna). Zamknij karte panelu.
pause
