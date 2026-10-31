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

export const config: AppConfig = {
  telegramBotToken: String(initial.telegramBotToken || '8866229116:AAGMh8nzO0I5M4GBaV4mv4AtdIg2Trp46OU'),
  telegramGroupId: String(initial.telegramGroupId || '-1003998557681'),
  fbProfileDir: path.resolve(String(initial.fbProfileDir || './.user-data/fb-profile')),
  headless: Boolean(initial.headless ?? false),
  dashboardPort: Number(initial.dashboardPort || 3300),
  dbPath: path.resolve(String(initial.dbPath || './data/mappings.json')),
  adminUsername: String(initial.adminUsername || 'admin'),
  adminPassword: String(initial.adminPassword || 'ecotrang2026'),
  authSecret: String(initial.authSecret || 'falconx_secret_key_bds_ecopark_2026'),
  dashboardHost: String(initial.dashboardHost || '0.0.0.0'),
  sharedTeamMode: initial.sharedTeamMode !== false,
};

export function updateSystemSettings(partial: Partial<AppConfig>): AppConfig {
  if (partial.telegramBotToken !== undefined) config.telegramBotToken = String(partial.telegramBotToken).trim();
  if (partial.telegramGroupId !== undefined) config.telegramGroupId = String(partial.telegramGroupId).trim();
  if (partial.headless !== undefined) config.headless = Boolean(partial.headless);
  if (partial.adminUsername !== undefined && partial.adminUsername.trim()) config.adminUsername = partial.adminUsername.trim();
  if (partial.adminPassword !== undefined && partial.adminPassword.trim()) config.adminPassword = partial.adminPassword.trim();
  if (partial.sharedTeamMode !== undefined) config.sharedTeamMode = Boolean(partial.sharedTeamMode);

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
