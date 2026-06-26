@echo off
chcp 65001 >nul 2>&1
title Kisisel Notlar - Kurulum

echo.
echo ============================================
echo   Kisisel Notlar - Windows Kurulum
echo ============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [!] Node.js bulunamadi!
    echo     https://nodejs.org adresinden indirin.
    echo.
    pause
    exit /b 1
)

echo [*] Node.js bulundu.
node -v

echo [*] Paketler yukleniyor...
npm install

if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo [+] .env dosyasi olusturuldu.
) else (
    echo [*] .env zaten mevcut, dokunulmadi.
)

echo.
echo ============================================
echo   Kurulum Tamamlandi!
echo ============================================
echo.
echo   Baslatmak icin: start.bat
echo.
pause
