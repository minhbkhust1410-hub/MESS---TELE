@echo off
chcp 65001 >nul
title Mở Chrome Nhập Mã PIN Facebook
echo ===========================================================
echo 🌐 MỞ CHROME ĐỂ NHẬP MÃ PIN KHÔI PHỤC TIN NHẮN FACEBOOK
echo ===========================================================
echo Đang mở trình duyệt Chrome...
echo Khi cửa sổ hiện lên, bạn chỉ cần:
echo 1. Gõ mã PIN 6 số của bạn (hoặc bấm nút Không khôi phục / bấm dấu X).
echo 2. Sau khi vào được tin nhắn bình thường, bạn đóng Chrome lại.
echo.
npx tsx src/scripts/login.ts
pause
