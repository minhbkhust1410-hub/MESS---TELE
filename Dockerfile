# ========================================================
# FALCONX PRO & KUDOX 2 - PRODUCTION DOCKERFILE (CLOUD 24/7)
# ========================================================
FROM node:20-slim

# Cài đặt các thư viện cần thiết cho Chromium & Headless Browser
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Thiết lập biến môi trường
ENV NODE_ENV=production \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    CHROME_PATH=/usr/bin/chromium \
    HEADLESS=true \
    PORT=3300

# Copy package.json và cài đặt thư viện
COPY package*.json ./
RUN npm install --omit=dev

# Copy toàn bộ mã nguồn
COPY . .

# Biên dịch hoặc nạp sẵn các thư mục data
RUN mkdir -p data public data/proofs

EXPOSE 3300

# Khởi chạy FalconX Web Dashboard & Engine
CMD ["npx", "tsx", "src/index.ts"]
