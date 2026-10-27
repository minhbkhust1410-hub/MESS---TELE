FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    HEADLESS=false \
    DASHBOARD_HOST=0.0.0.0 \
    PORT=3300

WORKDIR /app
COPY package.json package-lock.json ./

# Install the browser matching the locked Playwright version, plus a virtual
# display for the application's existing headed browser login flows.
RUN npm ci --include=dev \
    && npx --no-install playwright install --with-deps chromium \
    && apt-get update \
    && apt-get install -y --no-install-recommends xvfb xauth \
    && rm -rf /var/lib/apt/lists/*

COPY src ./src
COPY public ./public
COPY tsconfig.json ./
RUN mkdir -p data .user-data .tmp_media \
    && chown -R node:node /app /ms-playwright

USER node
EXPOSE 3300
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3300/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["xvfb-run", "-a", "--server-args=-screen 0 1366x768x24", "node", "--import", "tsx", "src/index.ts"]
