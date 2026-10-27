@echo off
title KudoX Mess x Tele 24/7 - He Thong Dong Bo
chcp 65001 >nul
cls

echo ========================================================
echo       KUDOX MESS x TELE - HE THONG DONG BO 24/7
echo ========================================================
echo.
echo [*] Dang kiem tra va giai phong cong 3300 neu co...

:: Giai phong cong 3300 neu bi tien trinh cu chiem giu
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3300 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: Chuyen thu muc lam viec chinh
cd /d "%~dp0"

:: Kiem tra nodejs
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [LOI] Khong tim thay Node.js trong he thong!
    echo Vui long kiem tra lai duong dan cai dat Node.js.
    pause
    exit /b 1
)

echo [*] Dang khoi dong He thong KudoX Mess x Tele...
echo [*] Giao dien Dashboard se tu dong mo tai: http://localhost:3300
echo.

:: Tu dong mo Dashboard tren trinh duyet sau 4 giay
start "" cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:3300"

:: Khoi chay he thong
call npm start

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ========================================================
    echo [CANH BAO] He thong bi dung lai!
    echo ========================================================
)

pause
