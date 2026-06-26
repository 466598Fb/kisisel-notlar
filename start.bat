@echo off
chcp 65001 >nul 2>&1
title Kisisel Notlar - Calisiyor

if not exist "node_modules" (
    echo [!] Once install.bat calistirin.
    pause
    exit /b 1
)

if not exist ".env" (
    copy ".env.example" ".env" >nul
)

echo.
echo ============================================
echo   Kisisel Notlar v3.0 baslatiliyor...
echo ============================================
echo.
echo   Durdurmak icin: Ctrl+C veya stop.bat
echo.

node src/server.js
