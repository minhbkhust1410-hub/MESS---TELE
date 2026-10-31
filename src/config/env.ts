import fs from 'fs';
import path from 'path';

export interface AppConfig {
  telegramBotToken: string;
  telegramGroupId: string;
  fbProfileDir: string;
  headless: boolean;
  dashboardPort: number;
  dbPath: string;
  adminUsername: string;
  adminPassword: string;
  authSecret: string;
  dashboardHost: string;
  sharedTeamMode: boolean;
  maxConcurrentBrowsers: number;
  publicUrl: string;
}

const DEFAULT_SETTINGS_FILE = path.resolve(process.cwd(), 'src/config/system-settings.json');
const RUNTIME_SETTINGS_FILE = path.resolve(process.cwd(), 'data/system_settings.json');

function loadMergedSettings(): Record<string, any> {
  let base: Record<string, any> = {};
  try {
    if (fs.existsSync(DEFAULT_SETTINGS_FILE)) {
      base = JSON.parse(fs.readFileSync(DEFAULT_SETTINGS_FILE, 'utf8').replace(/^\uFEFF/, ''));
    }
  } catch {}

  let runtime: Record<string, any> = {};
  try {
    if (fs.existsSync(RUNTIME_SETTINGS_FILE)) {
      runtime = JSON.parse(fs.readFileSync(RUNTIME_SETTINGS_FILE, 'utf8').replace(/^\uFEFF/, ''));
    }
  } catch {}

  return { ...base, ...runtime };
}

const initial = loadMergedSettings();
const isLinuxCloudWithoutDisplay = process.platform === 'linux' && !process.env.DISPLAY;

export const config: AppConfig = {
  telegramBotToken: String(
    process.env.TELEGRAM_BOT_TOKEN || initial.telegramBotToken || '8866229116:AAGMh8nzO0I5M4GBaV4mv4AtdIg2Trp46OU'
  ),
  telegramGroupId: String(process.env.TELEGRAM_GROUP_ID || initial.telegramGroupId || '-1003998557681'),
  fbProfileDir: path.resolve(String(process.env.FB_PROFILE_DIR || initial.fbProfileDir || './.user-data/fb-profile')),
  headless:
    process.env.HEADLESS !== undefined
      ? process.env.HEADLESS === 'true'
      : Boolean(initial.headless ?? isLinuxCloudWithoutDisplay),
  dashboardPort: Number(process.env.PORT || process.env.DASHBOARD_PORT || initial.dashboardPort || 3300),
  dbPath: path.resolve(String(process.env.DB_PATH || initial.dbPath || './data/mappings.json')),
  adminUsername: String(process.env.ADMIN_USERNAME || initial.adminUsername || 'admin'),
  adminPassword: String(process.env.ADMIN_PASSWORD || initial.adminPassword || 'ecotrang2026'),
  authSecret: String(process.env.AUTH_SECRET || initial.authSecret || 'falconx_secret_key_bds_ecopark_2026'),
  dashboardHost: String(process.env.DASHBOARD_HOST || initial.dashboardHost || '0.0.0.0'),
  sharedTeamMode: initial.sharedTeamMode !== false,
  maxConcurrentBrowsers: Math.max(
    1,
    Math.min(10, Number(process.env.MAX_CONCURRENT_BROWSERS || initial.maxConcurrentBrowsers || 3))
  ),
  publicUrl: String(process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || initial.publicUrl || ''),
};

export function updateSystemSettings(partial: Partial<AppConfig>): AppConfig {
  if (partial.telegramBotToken !== undefined) config.telegramBotToken = String(partial.telegramBotToken).trim();
  if (partial.telegramGroupId !== undefined) config.telegramGroupId = String(partial.telegramGroupId).trim();
  if (partial.headless !== undefined) config.headless = Boolean(partial.headless);
  if (partial.adminUsername !== undefined && partial.adminUsername.trim()) config.adminUsername = partial.adminUsername.trim();
  if (partial.adminPassword !== undefined && partial.adminPassword.trim()) config.adminPassword = partial.adminPassword.trim();
  if (partial.sharedTeamMode !== undefined) config.sharedTeamMode = Boolean(partial.sharedTeamMode);
  if (partial.maxConcurrentBrowsers !== undefined) {
    config.maxConcurrentBrowsers = Math.max(1, Math.min(10, Number(partial.maxConcurrentBrowsers) || 3));
  }
  if (partial.publicUrl !== undefined) config.publicUrl = String(partial.publicUrl).trim();

  const persisted = {
    telegramBotToken: config.telegramBotToken,
    telegramGroupId: config.telegramGroupId,
    fbProfileDir: './.user-data/fb-profile',
    headless: config.headless,
    dashboardPort: config.dashboardPort,
    dashboardHost: config.dashboardHost,
    dbPath: './data/mappings.json',
    adminUsername: config.adminUsername,
    adminPassword: config.adminPassword,
    authSecret: config.authSecret,
    sharedTeamMode: config.sharedTeamMode,
    maxConcurrentBrowsers: config.maxConcurrentBrowsers,
    publicUrl: config.publicUrl,
    updatedAt: new Date().toISOString(),
  };

  try {
    fs.mkdirSync(path.dirname(RUNTIME_SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(RUNTIME_SETTINGS_FILE, JSON.stringify(persisted, null, 2), 'utf8');
    fs.writeFileSync(DEFAULT_SETTINGS_FILE, JSON.stringify(persisted, null, 2), 'utf8');
  } catch {}

  return config;
}

export function validateConfig(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!config.telegramBotToken) missing.push('telegramBotToken');
  if (!config.telegramGroupId) missing.push('telegramGroupId');
  return { valid: missing.length === 0, missing };
}
