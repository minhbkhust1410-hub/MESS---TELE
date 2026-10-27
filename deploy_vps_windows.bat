@echo off
chcp 65001 >nul
title FalconX BĐS Automation - VPS Windows 24/24 Runner

echo ==============================================================================
echo 🚀 KHỞI ĐỘNG FALCONX BĐS AUTOMATION CHẠY 24/24 TRÊN VPS WINDOWS
echo ==============================================================================
cd /d "%~dp0"

echo 📦 [1/3] Kiểm tra thư viện và môi trường Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Chưa cài Node.js! Vui lòng tải và cài đặt Node.js LTS từ https://nodejs.org
    pause
    exit /b 1
)

echo 🔨 [2/3] Biên dịch TypeScript...
call npm run build
if %errorlevel% neq 0 (
    echo ❌ Lỗi biên dịch TypeScript!
    pause
    exit /b 1
)

echo 🌐 [3/3] Khởi động hệ thống FalconX Dashboard & Bot...
echo Dashboard mở tại: http://localhost:3300 (hoặc http://IP_VPS:3300)
echo ==============================================================================

:loop
call npm start
echo ⚠️ Tiến trình bị dừng hoặc khởi động lại sau 5 giây...
timeout /t 5 >nul
goto loop
