@echo off
title KudoX - Dang Nhap Facebook Eco Trang
chcp 65001 >nul
cls

echo ========================================================
echo   KUDOX - DANG NHAP FACEBOOK CHO BOT TU DONG HOA
echo ========================================================
echo.
echo [*] Dang giai phong tien trinh cu neu co...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3300 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo [*] Dang mo trinh duyet Google Chrome cho nick Eco Trang...
echo.
echo 👉 HUONG DAN:
echo 1. Cua so Chrome se hien len tren man hinh.
echo 2. Ban chi can nhap mat khau nick Eco Trang roi bam 'Dang nhap'.
echo 3. Khi da vao duoc Trang chu Facebook, ban DONG cua so Chrome lai.
echo.
echo ⏳ Dang mo trinh duyet...

"C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="D:\KudoX_Mess_Tele\.user-data\profiles\acc_61577949601039" "https://www.facebook.com"

echo.
echo ========================================================
echo [OK] DA LUU XONG PHIEN DANG NHAP!
echo [*] Tu dong khoi dong lai KudoX sau 3 giay...
echo ========================================================
timeout /t 3 /nobreak >nul
call Chay_He_Thong.bat