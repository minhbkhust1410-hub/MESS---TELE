import fs from 'node:fs';
import path from 'node:path';
import type { Page, ElementHandle } from 'playwright';
import { createWorker } from 'tesseract.js';
import { Solver } from '2captcha-ts';
import { Jimp } from 'jimp';

export interface CaptchaSolveResult {
  success: boolean;
  solution?: string;
  provider: 'gemini' | '2captcha' | 'tesseract' | 'telegram_hitl' | 'none';
  confidence?: number;
  latencyMs: number;
  error?: string;
}

export interface CaptchaSolveOptions {
  accountName?: string;
  twoCaptchaApiKey?: string;
  geminiApiKey?: string;
  capSolverApiKey?: string;
  preferredProvider?: 'gemini' | '2captcha' | 'tesseract' | 'auto';
  numericOnly?: boolean;
}

/**
 * Lấy cấu hình các API Key giải mã CAPTCHA từ biến môi trường hoặc runtime settings
 */
export function getCaptchaApiKeys(): {
  twoCaptchaKey?: string;
  geminiKey?: string;
  capSolverKey?: string;
} {
  const envTwoCaptcha = process.env.TWOCAPTCHA_API_KEY || process.env.CAPTCHA_API_KEY;
  const envGemini = process.env.GEMINI_API_KEY;
  const envCapSolver = process.env.CAPSOLVER_API_KEY;

  let fileKeys: any = {};
  const settingsFile = path.resolve(process.cwd(), 'data/captcha_settings.json');
  try {
    if (fs.existsSync(settingsFile)) {
      fileKeys = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    }
  } catch {}

  return {
    twoCaptchaKey: envTwoCaptcha || fileKeys.twoCaptchaKey || '',
    geminiKey: envGemini || fileKeys.geminiKey || '',
    capSolverKey: envCapSolver || fileKeys.capSolverKey || '',
  };
}

/**
 * Lưu cấu hình API Key giải CAPTCHA vào file cài đặt
 */
export function saveCaptchaApiKeys(keys: {
  twoCaptchaKey?: string;
  geminiKey?: string;
  capSolverKey?: string;
}): void {
  const settingsFile = path.resolve(process.cwd(), 'data/captcha_settings.json');
  try {
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    fs.writeFileSync(settingsFile, JSON.stringify(keys, null, 2), 'utf8');
  } catch (err: any) {
    console.error('Không thể lưu cài đặt CAPTCHA:', err.message);
  }
}

/**
 * Tiền xử lý ảnh CAPTCHA bằng Jimp:
 * Phóng to 2x, chuyển đen trắng (Grayscale), tăng độ tương phản, khử nhiễu đường kẻ
 */
export async function preprocessCaptchaImage(inputBuffer: Buffer): Promise<Buffer> {
  try {
    const image = await Jimp.read(inputBuffer);
    
    // 1. Phóng to 200% để Tesseract nhận dạng nét chữ rõ ràng hơn
    image.resize({ w: image.bitmap.width * 2, h: image.bitmap.height * 2 });

    // 2. Chuyển sang ảnh thang xám (Grayscale)
    image.greyscale();

    // 3. Tăng độ tương phản để làm nổi bật ký tự so với nền
    image.contrast(0.4);

    // 4. Trả về buffer PNG
    return await image.getBuffer('image/png');
  } catch {
    // Nếu lỗi xử lý ảnh thì giữ nguyên buffer gốc
    return inputBuffer;
  }
}

/**
 * Giải CAPTCHA bằng Local Tesseract.js OCR (Miễn phí, không cần mạng/API key)
 */
export async function solveWithTesseract(imageBuffer: Buffer, numericOnly = false): Promise<{ solution: string; confidence: number }> {
  // Tiền xử lý ảnh làm sạch nét chữ
  const processed = await preprocessCaptchaImage(imageBuffer);

  const worker = await createWorker('eng');
  try {
    await worker.setParameters({
      tessedit_char_whitelist: numericOnly
        ? '0123456789'
        : '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    });

    const { data } = await worker.recognize(processed);
    const rawText = data.text || '';
    const clean = rawText.replace(/[^a-zA-Z0-9]/g, '').trim();

    return {
      solution: clean,
      confidence: data.confidence || 0,
    };
  } finally {
    await worker.terminate();
  }
}

/**
 * Giải CAPTCHA bằng 2Captcha Cloud API (Dùng thư viện chính thức 2captcha-ts)
 */
export async function solveWith2Captcha(imageBuffer: Buffer, apiKey: string, numericOnly = false): Promise<string> {
  const solver = new Solver(apiKey);
  const base64 = imageBuffer.toString('base64');

  const res = await solver.imageCaptcha({
    body: base64,
    numeric: numericOnly ? 1 : 0,
    min_len: 4,
    max_len: 8,
  });

  if (!res || !res.data) {
    throw new Error('2Captcha không trả về kết quả.');
  }

  return res.data.trim();
}

/**
 * Giải CAPTCHA bằng Gemini Vision AI (Tốc độ siêu nhanh ~1s, độ chính xác cực cao với chữ biến dạng)
 */
export async function solveWithGemini(imageBuffer: Buffer, apiKey: string): Promise<string> {
  const base64 = imageBuffer.toString('base64');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        parts: [
          {
            text: 'Look at this distorted text/digit security CAPTCHA image. Read the exact characters shown in the image. Reply with ONLY the plain letters/digits, without any spaces, explanation, markdown, or punctuation.',
          },
          {
            inline_data: {
              mime_type: 'image/png',
              data: base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 20,
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API Error: ${response.status} - ${errText}`);
  }

  const json: any = await response.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const clean = text.replace(/[^a-zA-Z0-9]/g, '').trim();

  if (!clean) {
    throw new Error('Gemini không nhận diện được ký tự trong ảnh.');
  }

  return clean;
}

/**
 * Hàm giải mã tổng hợp đa tầng (Multi-Tier Solver):
 * Tự động lựa chọn phương án tối ưu nhất dựa trên API Key và cấu hình hiện có
 */
export async function solveCaptchaImage(
  imageBuffer: Buffer,
  options?: CaptchaSolveOptions
): Promise<CaptchaSolveResult> {
  const start = Date.now();
  const keys = getCaptchaApiKeys();
  const geminiKey = options?.geminiApiKey || keys.geminiKey;
  const twoCaptchaKey = options?.twoCaptchaApiKey || keys.twoCaptchaKey;
  const numericOnly = options?.numericOnly ?? false;

  // 1. ƯU TIÊN 1: Gemini 1.5 Flash Vision (Nếu có key -> Tốc độ cao nhất, độ chuẩn xác 98%+)
  if (geminiKey && geminiKey.trim()) {
    try {
      console.log('🤖 [Captcha Solver] Đang giải CAPTCHA qua Gemini Vision AI...');
      const text = await solveWithGemini(imageBuffer, geminiKey);
      return {
        success: true,
        solution: text,
        provider: 'gemini',
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      console.warn(`⚠️ [Captcha Solver] Gemini Vision thất bại (${err.message}). Chuyển sang tầng tiếp theo...`);
    }
  }

  // 2. ƯU TIÊN 2: 2Captcha Cloud API (Nếu có key 2Captcha)
  if (twoCaptchaKey && twoCaptchaKey.trim()) {
    try {
      console.log('🌐 [Captcha Solver] Đang gửi ảnh giải qua 2Captcha Cloud API...');
      const text = await solveWith2Captcha(imageBuffer, twoCaptchaKey, numericOnly);
      return {
        success: true,
        solution: text,
        provider: '2captcha',
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      console.warn(`⚠️ [Captcha Solver] 2Captcha thất bại (${err.message}). Chuyển sang tầng tiếp theo...`);
    }
  }

  // 3. ƯU TIÊN 3: Local Tesseract.js OCR (Chạy cục bộ 100% không cần key)
  try {
    console.log('🔤 [Captcha Solver] Đang giải CAPTCHA qua Local Tesseract.js OCR + Jimp...');
    const res = await solveWithTesseract(imageBuffer, numericOnly);
    if (res.solution && res.solution.length >= 4) {
      return {
        success: true,
        solution: res.solution,
        confidence: res.confidence,
        provider: 'tesseract',
        latencyMs: Date.now() - start,
      };
    }
  } catch (err: any) {
    console.warn(`⚠️ [Captcha Solver] Tesseract OCR thất bại: ${err.message}`);
  }

  return {
    success: false,
    provider: 'none',
    latencyMs: Date.now() - start,
    error: 'Không thể giải CAPTCHA tự động bằng các phương thức hiện có.',
  };
}

/**
 * Phát hiện xem trang Facebook hiện tại có đang yêu cầu giải CAPTCHA hay không
 */
export async function detectFacebookCaptcha(page: Page): Promise<{
  isCaptcha: boolean;
  imageElement?: ElementHandle;
  inputElement?: ElementHandle;
  submitButton?: ElementHandle;
  audioLinkElement?: ElementHandle;
  detectedText?: string;
}> {
  try {
    // 1. Kiểm tra văn bản đặc trưng của trang CAPTCHA Facebook
    const hasCaptchaKeywords = await page.evaluate(() => {
      const bodyText = document.body ? document.body.innerText : '';
      return (
        /Confirm that you're human|Enter the text from the image/i.test(bodyText) ||
        /Xác nhận bạn là con người|Nhập các ký tự bạn nhìn thấy trong hình/i.test(bodyText) ||
        /Security Check|Kiểm tra bảo mật/i.test(bodyText) ||
        /Can't read this text\? Hear this code/i.test(bodyText)
      );
    });

    if (!hasCaptchaKeywords) {
      return { isCaptcha: false };
    }

    // 2. Tìm ảnh CAPTCHA
    const imageSelectors = [
      'img[src*="captcha"]',
      'img[src*="tfbimage"]',
      'img[alt*="captcha" i]',
      'img[alt*="visual code" i]',
      'div[role="main"] img',
      'form img',
    ];

    let foundImg: ElementHandle | null = null;
    for (const sel of imageSelectors) {
      const el = await page.$(sel);
      if (el) {
        // Kiểm tra kích thước xem có phải ảnh CAPTCHA thật không (thường rộng 120-400px, cao 40-150px)
        const box = await el.boundingBox();
        if (box && box.width >= 80 && box.width <= 500 && box.height >= 25 && box.height <= 200) {
          foundImg = el;
          break;
        }
      }
    }

    // 3. Tìm ô nhập mã CAPTCHA
    const inputSelectors = [
      'input[type="text"]:not([type="hidden"])',
      'input[name="captcha_response"]',
      'input[name*="captcha" i]',
      'input[autocomplete="off"][type="text"]',
      'input[placeholder*="text" i]',
      'input[placeholder*="ký tự" i]',
      'form input[type="text"]',
      'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])',
    ];

    let foundInput: ElementHandle | null = null;
    for (const sel of inputSelectors) {
      const el = await page.$(sel);
      if (el) {
        foundInput = el;
        break;
      }
    }

    // 4. Tìm nút xác nhận (Continue / Tiếp tục)
    const buttonSelectors = [
      'div[aria-label="Continue"]',
      'div[aria-label="Tiếp tục"]',
      'div[role="button"]:has-text("Continue")',
      'div[role="button"]:has-text("Tiếp tục")',
      '[role="button"]:has-text("Continue")',
      '[role="button"]:has-text("Tiếp tục")',
      'button:has-text("Continue")',
      'button:has-text("Tiếp tục")',
      'button:has-text("Xác nhận")',
      'button[type="submit"]',
      'input[type="submit"]',
    ];

    let foundBtn: ElementHandle | null = null;
    for (const sel of buttonSelectors) {
      const el = await page.$(sel);
      if (el) {
        foundBtn = el;
        break;
      }
    }

    // 5. Kiểm tra liên kết Audio CAPTCHA
    const audioLink = await page.$('a:has-text("Hear this code"), a:has-text("Nghe mã này")');

    return {
      isCaptcha: Boolean(foundImg && foundInput),
      imageElement: foundImg || undefined,
      inputElement: foundInput || undefined,
      submitButton: foundBtn || undefined,
      audioLinkElement: audioLink || undefined,
    };
  } catch {
    return { isCaptcha: false };
  }
}

/**
 * Tải file Audio CAPTCHA của Facebook qua luồng "Hear this code"
 */
export async function fetchAudioCaptcha(page: Page, timeoutMs = 7000): Promise<Buffer | null> {
  return new Promise(async (resolve) => {
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }, timeoutMs);

    const onResponse = async (res: any) => {
      try {
        const url = res.url();
        const ct = res.headers()['content-type'] || '';
        if (url.includes('tfbaudio') || ct.includes('audio/mpeg') || ct.includes('audio/')) {
          const body = await res.body();
          if (body && body.length > 1000 && !resolved) {
            resolved = true;
            clearTimeout(timer);
            page.off('response', onResponse);
            resolve(body);
          }
        }
      } catch {}
    };

    page.on('response', onResponse);

    try {
      const audioLink = await page.$('a:has-text("Hear this code"), a:has-text("Nghe mã này")');
      if (audioLink) {
        await audioLink.click();
      } else {
        clearTimeout(timer);
        page.off('response', onResponse);
        resolve(null);
      }
    } catch {
      clearTimeout(timer);
      page.off('response', onResponse);
      resolve(null);
    }
  });
}

/**
 * Giải CAPTCHA âm thanh bằng Gemini Flash Audio (Tự động nghe và bóc tách các chữ số)
 */
export async function solveAudioWithGemini(audioBuffer: Buffer, apiKey: string): Promise<string> {
  const base64 = audioBuffer.toString('base64');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        parts: [
          {
            text: 'Listen to this security captcha audio recording carefully. The speaker reads out digits in English. Reply ONLY with the plain numbers without any spaces, explanation, markdown, or punctuation.',
          },
          {
            inline_data: {
              mime_type: 'audio/mp3',
              data: base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 20,
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini Audio Error: ${response.status} - ${errText}`);
  }

  const json: any = await response.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const clean = text.replace(/[^0-9]/g, '').trim();

  if (!clean || clean.length < 4) {
    throw new Error(`Gemini không nhận diện đủ dãy số audio: "${text}"`);
  }

  return clean;
}

/**
 * Tự động giải và vượt qua CAPTCHA Facebook trên Page hiện tại
 */
export async function autoSolveFacebookCaptcha(
  page: Page,
  accountName?: string,
  options?: CaptchaSolveOptions,
  manualCode?: string
): Promise<{ solved: boolean; solution?: string; error?: string }> {
  const detected = await detectFacebookCaptcha(page);
  if (!detected.isCaptcha || !detected.imageElement || !detected.inputElement) {
    return { solved: false, error: 'Không tìm thấy CAPTCHA trên trang.' };
  }

  console.log(`🧩 [Captcha Auto-Solver] Phát hiện màn hình CAPTCHA cho tài khoản "${accountName || 'Facebook'}"!`);

  let codeToEnter = manualCode ? manualCode.trim() : '';

  if (!codeToEnter) {
    // 1. Chụp ảnh phần tử CAPTCHA
    const imgBuffer = await detected.imageElement.screenshot();
    console.log(`📸 [Captcha Auto-Solver] Đã trích xuất ảnh CAPTCHA (${imgBuffer.length} bytes). Đang giải mã...`);

    // 2. Thử giải bằng ảnh trước (Gemini Vision / 2Captcha / Tesseract)
    const solveResult = await solveCaptchaImage(imgBuffer, {
      accountName,
      numericOnly: true,
      ...options,
    });

    if (solveResult.success && solveResult.solution && solveResult.solution.length >= 4) {
      codeToEnter = solveResult.solution;
      console.log(`✅ [Captcha Auto-Solver] Đã giải thành công qua ảnh: "${codeToEnter}" (${solveResult.provider})!`);
    } else {
      // 3. Nếu giải ảnh chưa thành công và có Gemini Key -> Thử giải qua Audio Captcha (Hear this code)
      const keys = getCaptchaApiKeys();
      const geminiKey = options?.geminiApiKey || keys.geminiKey;
      if (geminiKey && geminiKey.trim()) {
        try {
          console.log(`🔊 [Captcha Auto-Solver] Đang tải luồng Audio Captcha để nhận dạng giọng nói...`);
          const audioBuffer = await fetchAudioCaptcha(page);
          if (audioBuffer) {
            codeToEnter = await solveAudioWithGemini(audioBuffer, geminiKey);
            console.log(`🎧 [Captcha Auto-Solver] Đã nghe và nhận diện mã Audio: "${codeToEnter}"!`);
          }
        } catch (audioErr: any) {
          console.warn(`⚠️ [Captcha Auto-Solver] Nhận dạng Audio thất bại: ${audioErr.message}`);
        }
      }
    }
  }

  if (!codeToEnter) {
    return {
      solved: false,
      error: 'Không thể giải mã CAPTCHA tự động bằng các phương thức hiện có.',
    };
  }

  console.log(`✍️ [Captcha Auto-Solver] Đang nhập mã "${codeToEnter}" vào ô xác nhận...`);

  // Nhập đáp án vào ô với tốc độ giống người thật
  await detected.inputElement.click();
  await detected.inputElement.fill('');
  for (const char of codeToEnter) {
    await page.keyboard.type(char, { delay: 60 + Math.random() * 50 });
  }

  await page.waitForTimeout(600);

  // Nhấn nút Continue
  if (detected.submitButton) {
    await detected.submitButton.click();
  } else {
    await page.keyboard.press('Enter');
  }

  console.log(`🚀 [Captcha Auto-Solver] Đã gửi đáp án "${codeToEnter}". Đang chờ Facebook xác thực...`);
  await page.waitForTimeout(4000);

  // Kiểm tra xem CAPTCHA đã được giải quyết chưa
  const postCheck = await detectFacebookCaptcha(page);
  if (!postCheck.isCaptcha) {
    console.log(`🎉 [Captcha Auto-Solver] VƯỢT CAPTCHA THÀNH CÔNG! Trang Facebook đã tiếp tục hoạt động.`);
    return { solved: true, solution: codeToEnter };
  } else {
    return {
      solved: false,
      solution: codeToEnter,
      error: 'Mã CAPTCHA có thể chưa chính xác hoặc đã đổi mã mới, Facebook vẫn đang hiển thị yêu cầu giải lại.',
    };
  }
}
