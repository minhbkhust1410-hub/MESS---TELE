@echo off
chcp 65001 >nul
title FB EXTEN - Professional Automation & Private Extension System
cd /d "%~dp0"

echo =========================================================================
echo 🚀 KHỞI ĐỘNG HỆ THỐNG FB EXTEN (HYBRID CORE + EXTENSION)
echo =========================================================================
echo 🌐 Web Dashboard: http://localhost:3300
echo ☁️ Cloud DB: 100%% Online Encrypted Vault (0 Byte Local)
echo 🛡️ Permissions: Full Master Admin Privileges Granted
echo =========================================================================

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo ❌ Chưa tìm thấy Node.js trên máy! Vui lòng cài đặt Node.js từ https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo 📦 Đang cài đặt thư viện phụ thuộc...
  call npm install
)

echo ▶️ Đang khởi chạy hệ thống FalconX...
call npm start
pause
