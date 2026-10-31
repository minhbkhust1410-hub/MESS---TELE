# ==============================================================================
# HƯỚNG DẪN & SCRIPT 1-CLICK DEPLOY LÊN HUGGING FACE SPACES (16GB RAM FREE)
# ==============================================================================

param (
    [string]$HfSpaceName = ""
)

Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host "🚀 DEPLOY FALCONX CLUSTER (40-100 NICK) LÊN HUGGING FACE SPACES" -ForegroundColor Green
Write-Host "   16 GB RAM • 2 vCPU • Domain HTTPS Vĩnh Viễn ($0/tháng)" -ForegroundColor Yellow
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host ""

if (-not $HfSpaceName) {
    Write-Host "Vui lòng nhập tên Hugging Face Space theo định dạng: <username>/<space_name>" -ForegroundColor Yellow
    Write-Host "Ví dụ: minhbkhust/falconx-cluster" -ForegroundColor White
    $HfSpaceName = Read-Host "Nhập Space: "
}

if (-not $HfSpaceName) {
    Write-Host "Chưa nhập Space name. Dừng tiến trình." -ForegroundColor Red
    Exit
}

Write-Host "Đang kiểm tra remote git 'hf-space'..." -ForegroundColor Cyan
$existing = git remote | Select-String "hf-space"
if ($existing) {
    git remote remove hf-space
}

$spaceUrl = "https://huggingface.co/spaces/$HfSpaceName"
Write-Host "Đang thêm remote: $spaceUrl" -ForegroundColor Cyan
git remote add hf-space $spaceUrl

Write-Host "Đang đẩy mã nguồn và Dockerfile lên Hugging Face Space..." -ForegroundColor Green
git push --force hf-space main

Write-Host ""
Write-Host "🎉 HOÀN TẤT ĐẨY MÃ NGUỒN!" -ForegroundColor Green
Write-Host "Space của bạn sẽ tự động Build Docker và Online tại:" -ForegroundColor Cyan
Write-Host "https://huggingface.co/spaces/$HfSpaceName" -ForegroundColor Yellow
Write-Host ""
