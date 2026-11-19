<#
.SYNOPSIS
  FB EXTEN - Professional PowerShell Automation Launcher
  Cấp mọi quyền thực thi (Bypass ExecutionPolicy) và khởi chạy hệ thống
#>

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ProjectRoot

Write-Host "`n=========================================================================" -ForegroundColor Cyan
Write-Host "🚀 KHỞI ĐỘNG HỆ THỐNG FB EXTEN (HYBRID CORE + PRIVATE EXTENSION)" -ForegroundColor Green
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host "🌐 Web Dashboard: http://localhost:3300" -ForegroundColor Yellow
Write-Host "☁️ Cơ Sở Dữ Liệu: 100% Online Cloud Database (0 Byte Local Disk)" -ForegroundColor Cyan
Write-Host "🛡️ Phân Quyền: Cấp Mọi Quyền (Full Privileges & Process Bypass)" -ForegroundColor Magenta
Write-Host "=========================================================================`n" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Không tìm thấy Node.js trên hệ thống! Vui lòng cài đặt Node.js từ https://nodejs.org" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Đang cài đặt thư viện phụ thuộc (npm install)..." -ForegroundColor Yellow
    npm install
}

Write-Host "▶️ Đang khởi chạy máy chủ FalconX..." -ForegroundColor Green
npm start
