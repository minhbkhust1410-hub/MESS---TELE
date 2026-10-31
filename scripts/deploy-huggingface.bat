@echo off
chcp 65001 >nul
echo ===========================================================
echo 🚀 DEPLOY FALCONX CLUSTER (40-100 NICK) LÊN HUGGING FACE SPACES
echo    16 GB RAM • 2 vCPU • Domain HTTPS Vĩnh Viễn ($0/tháng)
echo ===========================================================
echo.
set /p HF_SPACE="Nhập tên Space theo định dạng <username>/<space_name> (Ví dụ: minhbkhust/falconx-cluster): "

if "%HF_SPACE%"=="" (
    echo Bạn chưa nhập Space name. Đã hủy.
    pause
    exit /b
)

echo.
echo Đang cấu hình Git remote 'hf-space'...
git remote remove hf-space 2>nul
git remote add hf-space https://huggingface.co/spaces/%HF_SPACE%

echo.
echo Đang đẩy mã nguồn và Dockerfile lên Hugging Face Space...
git push --force hf-space main

echo.
echo ===========================================================
echo 🎉 HOÀN TẤT ĐẨY MÃ NGUỒN!
echo Space của bạn sẽ tự động Build Docker và Online tại:
echo https://huggingface.co/spaces/%HF_SPACE%
echo ===========================================================
pause
