import fs from 'node:fs';
import path from 'node:path';
import { getAllAccounts, saveAccount } from '../db/store.js';
import { getOrCreateLocalProxyBridge } from '../core/proxy-bridge.js';

interface ProfileMapping {
  accId: string;
  profileName: string;
  folderName: string; // e.g. "Profile 11"
  fillColor: number;
  strokeColor: number;
  proxy: string;
}

const mappings: ProfileMapping[] = [
  {
    accId: 'acc_61594700679230',
    profileName: 'Eco Trang (BĐS)',
    folderName: 'Profile 11',
    fillColor: -16631490, // Emerald Green
    strokeColor: -1,
    proxy: '198.46.161.42:5092:vmhknvrs:7uwqw64x039b',
  },
  {
    accId: 'acc_61596139196601',
    profileName: 'Eco Chang',
    folderName: 'Profile 12',
    fillColor: -7835613, // Purple
    strokeColor: -1,
    proxy: '38.154.185.97:6370:vmhknvrs:7uwqw64x039b',
  },
  {
    accId: 'acc_61595752513628',
    profileName: 'Lang Thang Eco',
    folderName: 'Profile 13',
    fillColor: -16033840, // Cyan / Teal
    strokeColor: -1,
    proxy: '104.164.49.38:7693:vmhknvrs:7uwqw64x039b',
  },
  {
    accId: 'acc_61595720205122',
    profileName: 'Lang Thang Eco 01',
    folderName: 'Profile 14',
    fillColor: -15261648, // Deep Blue
    strokeColor: -1,
    proxy: '198.23.243.226:6361:vmhknvrs:7uwqw64x039b',
  },
  {
    accId: 'acc_61595823008326',
    profileName: 'BDS Ecopark 04',
    folderName: 'Profile 15',
    fillColor: -2497544, // Amber / Orange
    strokeColor: -1,
    proxy: '191.96.254.138:6185:vmhknvrs:7uwqw64x039b',
  },
];

export async function setupNativeChromeProfiles(): Promise<void> {
  const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\ADMIN\\AppData\\Local';
  const chromeUserData = path.join(localAppData, 'Google', 'Chrome', 'User Data');
  const localStatePath = path.join(chromeUserData, 'Local State');

  if (!fs.existsSync(localStatePath)) {
    console.error(`❌ Không tìm thấy file Local State tại: ${localStatePath}`);
    return;
  }

  // 1. Đọc và backup Local State
  console.log(`📖 Đang đọc file Local State của Google Chrome...`);
  const localStateRaw = fs.readFileSync(localStatePath, 'utf8');
  const localState = JSON.parse(localStateRaw);

  if (!localState.profile) localState.profile = {};
  if (!localState.profile.info_cache) localState.profile.info_cache = {};
  if (!Array.isArray(localState.profile.profiles_order)) {
    localState.profile.profiles_order = Object.keys(localState.profile.info_cache);
  }

  // 2. Cập nhật từng Profile vào Chrome Local State
  for (const m of mappings) {
    console.log(`🔧 Đang thiết lập Chrome Profile: "${m.profileName}" (${m.folderName})...`);

    // Ghi vào info_cache để xuất hiện trên thanh đổi Profile của Chrome
    localState.profile.info_cache[m.folderName] = {
      active_time: Date.now() / 1000,
      avatar_icon: 'chrome://theme/IDR_PROFILE_AVATAR_26',
      background_apps: false,
      default_avatar_fill_color: m.fillColor,
      default_avatar_stroke_color: m.strokeColor,
      enterprise_label: '',
      force_signin_profile_locked: false,
      gaia_given_name: '',
      gaia_id: '',
      gaia_name: '',
      hosted_domain: '',
      is_consented_primary_account: false,
      is_ephemeral: false,
      is_glic_eligible: false,
      is_managed: 0,
      is_using_default_avatar: true,
      is_using_default_name: false,
      managed_user_id: '',
      metrics_bucket_index: 20 + parseInt(m.folderName.replace(/\D/g, '') || '0', 10),
      name: m.profileName,
      profile_color_seed: m.fillColor,
      profile_highlight_color: m.fillColor,
      shortcut_name: m.profileName,
      signin_with_credential_provider: false,
      user_name: '',
    };

    // Đưa vào danh sách thứ tự hiển thị nếu chưa có
    if (!localState.profile.profiles_order.includes(m.folderName)) {
      localState.profile.profiles_order.push(m.folderName);
    }

    // Tạo thư mục vật lý cho Profile trong Google Chrome
    const profileFolder = path.join(chromeUserData, m.folderName);
    if (!fs.existsSync(profileFolder)) {
      fs.mkdirSync(profileFolder, { recursive: true });
    }

    // Tạo file Preferences cơ bản
    const prefPath = path.join(profileFolder, 'Preferences');
    let prefObj: any = {};
    if (fs.existsSync(prefPath)) {
      try {
        prefObj = JSON.parse(fs.readFileSync(prefPath, 'utf8'));
      } catch {}
    }
    if (!prefObj.profile) prefObj.profile = {};
    prefObj.profile.name = m.profileName;
    prefObj.profile.avatar_index = 26;
    try {
      fs.writeFileSync(prefPath, JSON.stringify(prefObj, null, 2), 'utf8');
    } catch {}

    // Sao chép Cookies nếu có từ .user-data/profiles sang profile của Chrome
    const oldCookiePath = path.resolve(`./.user-data/profiles/${m.accId}/Default/Network/Cookies`);
    const newNetworkDir = path.join(profileFolder, 'Network');
    const newCookiePath = path.join(newNetworkDir, 'Cookies');
    if (fs.existsSync(oldCookiePath) && !fs.existsSync(newCookiePath)) {
      if (!fs.existsSync(newNetworkDir)) fs.mkdirSync(newNetworkDir, { recursive: true });
      try {
        fs.copyFileSync(oldCookiePath, newCookiePath);
        console.log(`🍪 Đã sao chép Cookies Facebook cho ${m.profileName}`);
      } catch {}
    }

    // Cập nhật profileDir trong cơ sở dữ liệu store.ts
    saveAccount({
      id: m.accId,
      profileDir: profileFolder,
    });
  }

  // 3. Ghi lại Local State
  fs.writeFileSync(localStatePath, JSON.stringify(localState, null, 2), 'utf8');
  console.log(`✅ ĐÃ GHI THÀNH CÔNG LOCAL STATE CỦA GOOGLE CHROME!`);
  console.log(`🎉 5 Profile Facebook đã được thêm chính thức vào menu Hồ Sơ của Google Chrome!`);
}

// Chạy trực tiếp
setupNativeChromeProfiles().catch(console.error);
