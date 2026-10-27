const fs = require('fs');

const filePath = 'D:/KudoX_Mess_Tele/public/index.html';
let html = fs.readFileSync(filePath, 'utf8');

html = html.replace('Hàng Đợi Bài Đăng & Lịch Phân Phối (Topic 1)', 'Hàng Đợi Bài Đăng & Lịch Phân Phối Group');
html = html.replace('Topic 2 - Bình Luận Có Hậu Kiểm DOM Xác Minh (F02)', 'Tự Động Bình Luận & Xác Minh Bài Viết');
html = html.replace('Gửi link Facebook kèm nội dung vào Topic 2 Telegram để bot bình luận ngay lập tức.', 'Gửi link Facebook kèm nội dung vào Telegram để bot bình luận ngay lập tức.');
html = html.replace('Topic #67 (Topic 2)', 'Topic Quỹ Căn (#67)');
html = html.replace('MODULE 1: TOPIC 3 - QUÉT SÂU THÀNH VIÊN MỚI TRONG GROUP', 'QUÉT THÀNH VIÊN MỚI TRONG CÁC GROUP MỤC TIÊU');
html = html.replace('MODULE 2: TOPIC 4 - AUTO KẾT BẠN AN TOÀN TRÁNH CHECKPOINT', 'TỰ ĐỘNG KẾT BẠN AN TOÀN THEO TỆP KHÁCH');
html = html.replace('MODULE 3: TOPIC 5 - BÃO LIKE/THẢ TY AUTO THEO KỊCH BẢN', 'TƯƠNG TÁC TỰ ĐỘNG & NUÔI TÀI KHOẢN');

fs.writeFileSync(filePath, html, 'utf8');
console.log('Text labels normalized successfully.');
