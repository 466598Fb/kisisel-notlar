@echo off
chcp 65001 >nul 2>&1
echo [*] Kisisel Notlar durduruluyor...
taskkill /f /im node.exe >nul 2>&1
echo [+] Durduruldu.
timeout /t 2 >nul
