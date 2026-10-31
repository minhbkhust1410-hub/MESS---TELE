@echo off
title Dong Bo Code Len Github - FalconX
chcp 65001 >nul
cls

echo ========================================================
echo    DONG BO MA NGUON LEN GITHUB (AUTO PUSH)
echo ========================================================
echo.
cd /d "%~dp0"

echo [*] Dang kiem tra cac file thay doi moi nhat...
git add .

for /f "tokens=1-4 delims=/ " %%a in ('date /t') do set mydate=%%a-%%b-%%c
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set mytime=%%a:%%b

git commit -m "Cap nhat tu dong ngay %mydate% luc %mytime%"

echo.
echo [*] Dang day len GitHub (Branch: main)...
git push origin main

echo.
echo ========================================================
echo [OK] DA DONG BO XONG LEN GITHUB THANH CONG!
echo Link repo: https://github.com/minhbkhust1410-hub/MESS---TELE
echo ========================================================
echo.
pause
