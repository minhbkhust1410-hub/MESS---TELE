const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ffmpegPath = 'D:/KudoX_Mess_Tele/node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe';
const outputDir = 'D:/KudoX_Mess_Tele/presentation';
const tempAudioDir = path.join(outputDir, 'temp_audio');

if (!fs.existsSync(tempAudioDir)) {
  fs.mkdirSync(tempAudioDir, { recursive: true });
}

// Danh sách các câu thuyết minh ngắn gọn (mỗi câu < 150 ký tự để Google TTS xử lý mượt mà)
const scriptParts = [
  "Xin chào quý đối tác và quý khách hàng.",
  "Chào mừng quý vị đến với video giới thiệu thực tế Hệ Thống Tự Động Hóa FalconX Pro phiên bản v2.0 Enterprise.",
  "Đây là giải pháp toàn diện kết nối Facebook và Telegram,",
  "ứng dụng Trí Tuệ Nhân Tạo AI và Tọa Độ Google Maps vào kinh doanh thực chiến.",
  
  "Giao diện hệ thống được thiết kế theo phong cách Bento Grid hiện đại,",
  "tone màu Sáng Vàng Hoàng Kim tươi sáng, dịu mắt và giàu năng lượng.",
  "Đặc biệt, hệ thống hỗ trợ chuyển đổi linh hoạt 2 chế độ hoạt động:",
  "Bất Động Sản Ecopark và Forex Tài Chính Đầu Tư chỉ với một cú chạm.",

  "Tính năng đầu tiên là Trung Tâm Đăng Bài Nhóm Facebook Tự Động.",
  "Quý vị có thể soạn bài trực tiếp trên Web hoặc gửi tin nhắn vào Topic 1 Telegram.",
  "Hệ thống sẽ tự động đăng bài vào hàng chục hội nhóm mục tiêu,",
  "tích hợp thuật toán giãn cách thông minh giúp tài khoản luôn an toàn và chống checkpoint.",

  "Tiếp theo là tính năng Quét Thành Viên Mới Gia Nhập Nhóm Facebook.",
  "Ứng dụng công nghệ KudoX 2, hệ thống tự động bóc tách danh sách UID những người vừa tham gia nhóm trong 24 giờ qua.",
  "Mọi dữ liệu khách hàng tiềm năng đều được tự động đồng bộ vào Kho Dữ Liệu Khách Đã Quét,",
  "hỗ trợ quản lý trạng thái liên hệ và xuất file Excel một chạm để chăm sóc đa kênh.",

  "Trong lĩnh vực Bất Động Sản, hệ thống cung cấp bảng quản lý Quỹ Căn trực quan.",
  "Khối Căn Mới Nạp Trong Ngày hiển thị nổi bật với mốc giờ nạp chính xác,",
  "giúp đội ngũ kinh doanh nắm bắt nguồn hàng mới nhất chỉ trong tích tắc.",

  "Điểm đột phá cốt lõi là Lõi AI Miễn Phí Google Gemini Flash và Groq Llama 3.3.",
  "Hằng ngày, quý vị chỉ cần dán tin nhắn hoặc tải ảnh bảng hàng,",
  "AI sẽ tự động phân loại loại phòng, giá tiền và gán tọa độ GPS Google Maps thực tế.",

  "Đặc biệt, hệ thống sở hữu Cơ chế Bể Khóa Chống Nghẽn 24/7.",
  "Khi một API Key chạm giới hạn 15 RPM hoặc hết hạn mức,",
  "hệ thống tự động đổi ngay sang Key tiếp theo và tự động chuyển đổi sang Groq Cloud hoặc Lõi NLP Offline.",
  "Đảm bảo không bao giờ hết dung lượng hay nghẽn quá trình sử dụng.",

  "Khi khách hàng đăng bài tìm nhà trong các nhóm Facebook,",
  "thuật toán Radar GPS Haversine sẽ tự động đối chiếu cự ly đi bộ thực tế giữa toà khách hỏi và kho căn sẵn có.",
  "AI sẽ tự động sinh bình luận cá nhân hóa cực kỳ tự nhiên,",
  "dẫn chứng khoảng cách đi bộ chính xác và mời khách check tin nhắn kèm số điện thoại liên hệ.",

  "Cuối cùng, mọi tin nhắn của khách hàng trên Messenger đều được đồng bộ tức thì hai chiều sang từng Topic riêng trên Telegram.",
  "Quý vị có thể tư vấn và chốt khách ngay trên điện thoại di động mọi lúc mọi nơi.",

  "FalconX Pro: Tự Động Hóa Thực Chiến, Tối Ưu Nguồn Lực, Bứt Phá Doanh Thu.",
  "Cảm ơn quý đối tác và khách hàng đã theo dõi."
];

async function downloadTtsChunk(text, filePath) {
  const url = 'https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=' + encodeURIComponent(text);
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
  if (!res.ok) throw new Error(`TTS failed with status ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(filePath, buf);
}

async function main() {
  console.log(`🎙️ Bắt đầu tạo file giọng nói tiếng Việt (${scriptParts.length} phân đoạn)...`);
  const chunkFiles = [];

  for (let i = 0; i < scriptParts.length; i++) {
    const text = scriptParts[i];
    const chunkPath = path.join(tempAudioDir, `chunk_${String(i).padStart(3, '0')}.mp3`);
    console.log(`[${i + 1}/${scriptParts.length}] Đang tổng hợp: "${text.slice(0, 40)}..."`);
    await downloadTtsChunk(text, chunkPath);
    chunkFiles.push(chunkPath);
    // Nhẹ nhàng nghỉ 150ms giữa các request
    await new Promise(r => setTimeout(r, 150));
  }

  // Tạo file danh sách nối file cho ffmpeg
  const listFilePath = path.join(tempAudioDir, 'chunks_list.txt');
  const listContent = chunkFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n');
  fs.writeFileSync(listFilePath, listContent, 'utf-8');

  const finalAudioPath = path.join(outputDir, 'voiceover_full.mp3');
  console.log('🔄 Đang ghép toàn bộ các phân đoạn âm thanh thành voiceover_full.mp3...');

  const mergeCmd = `"${ffmpegPath}" -y -f concat -safe 0 -i "${listFilePath}" -c copy "${finalAudioPath}"`;
  execSync(mergeCmd, { stdio: 'inherit' });

  console.log('✅ Hoàn thành file âm thanh thuyết minh chất lượng cao:');
  console.log(`📁 Đường dẫn: ${finalAudioPath}`);

  // Tính độ dài âm thanh
  const probeCmd = `"${ffmpegPath}" -i "${finalAudioPath}" 2>&1`;
  try {
    const info = execSync(probeCmd).toString();
    const durMatch = info.match(/Duration: (\d{2}:\d{2}:\d{2}\.\d{2})/);
    if (durMatch) {
      console.log(`⏱️ Thời lượng audio: ${durMatch[1]}`);
    }
  } catch (err) {
    const output = err.stdout?.toString() || err.stderr?.toString() || '';
    const durMatch = output.match(/Duration: (\d{2}:\d{2}:\d{2}\.\d{2})/);
    if (durMatch) {
      console.log(`⏱️ Thời lượng audio: ${durMatch[1]}`);
    }
  }
}

main().catch(err => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});
