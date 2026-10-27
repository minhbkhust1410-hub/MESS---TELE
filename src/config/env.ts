import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

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
}

export const config: AppConfig = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramGroupId: process.env.TELEGRAM_GROUP_ID || '',
  fbProfileDir: path.resolve(process.env.FB_PROFILE_DIR || './.user-data/fb-profile'),
  headless: process.env.HEADLESS === 'true',
  dashboardPort: parseInt(process.env.PORT || process.env.DASHBOARD_PORT || '3300', 10),
  dbPath: path.resolve(process.env.DB_PATH || './data/mappings.json'),
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'ecotrang2026',
  authSecret: process.env.AUTH_SECRET || 'falconx_secret_key_bds_ecopark_2026',
  dashboardHost: process.env.DASHBOARD_HOST || '0.0.0.0',
};

export function validateConfig(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!config.telegramBotToken) missing.push('TELEGRAM_BOT_TOKEN');
  if (!config.telegramGroupId) missing.push('TELEGRAM_GROUP_ID');
  return { valid: missing.length === 0, missing };
}
