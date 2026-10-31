# ==============================================================================
# FALCONX ENTERPRISE DOCKERFILE (PLAYWRIGHT + XVFB + 40-100 ACCOUNT WAVE POOL)
# Optimized for Free Public Cloud: Hugging Face Spaces (16GB RAM), Oracle Free Tier, Render, Fly.io
# ==============================================================================

FROM mcr.microsoft.com/playwright:v1.50.1-jammy

# Set environment
ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    PORT=7860 \
    DASHBOARD_PORT=7860 \
    DASHBOARD_HOST=0.0.0.0 \
    HEADLESS=true \
    MAX_CONCURRENT_BROWSERS=3 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    DISPLAY=:99

WORKDIR /app

# Install system dependencies (Xvfb virtual display, Vietnamese fonts, Tesseract OCR, FFmpeg)
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    xauth \
    curl \
    ca-certificates \
    ffmpeg \
    fonts-noto-cjk \
    fonts-liberation \
    fonts-dejavu-core \
    tesseract-ocr \
    tesseract-ocr-vie \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy package descriptors
COPY package*.json tsconfig.json ./

# Install npm dependencies (including devDependencies for build, then prune)
RUN npm install --legacy-peer-deps

# Copy source code and assets
COPY src/ ./src/
COPY public/ ./public/

# Compile TypeScript
RUN npm run build

# Clean up dev dependencies to minimize image size
RUN npm prune --production

# Create non-root user directories for safety
RUN mkdir -p /app/data /app/.user-data /app/.tmp_media && \
    chmod -R 777 /app/data /app/.user-data /app/.tmp_media

# Expose Hugging Face standard port 7860 and FalconX port 3300
EXPOSE 7860 3300

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://127.0.0.1:${PORT:-7860}/healthz || exit 1

# Start virtual X11 server and launch FalconX Cluster
CMD ["sh", "-c", "Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset & node dist/index.js"]
