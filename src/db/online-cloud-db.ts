import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';

// Lưu bản gốc của fs trước khi ảo hóa Cloud VFS
const realFs = {
  existsSync: fs.existsSync.bind(fs),
  readFileSync: fs.readFileSync.bind(fs),
  writeFileSync: fs.writeFileSync.bind(fs),
  appendFileSync: fs.appendFileSync.bind(fs),
  mkdirSync: fs.mkdirSync.bind(fs),
  readdirSync: fs.readdirSync.bind(fs),
  statSync: fs.statSync.bind(fs),
  unlinkSync: fs.unlinkSync.bind(fs),
  renameSync: fs.renameSync.bind(fs),
  rmSync: fs.rmSync.bind(fs),
};

const REPO_OWNER = 'minhbkhust1410-hub';
const REPO_NAME = 'MESS---TELE';
const CLOUD_BRANCH = 'cloud-database';
const VAULT_FILENAME = 'cloud_db_vault.json';
const MASTER_KEY_SEED = 'falconx_cloud_db_master_key_2026';
const ENC_CLOUD_TOKEN = 'Cut3iZDYVWeLa+Nj1Y6LRurmeWWJxPYuu/C/tdfUTAwfqSY/RuQ7qA==.ltabok1+vVMHLWsaAH03dg==';

function getMasterKey(): Buffer {
  return crypto.createHash('sha256').update(MASTER_KEY_SEED).digest();
}

function decryptCloudToken(): string {
  try {
    const [encB64, tagB64] = ENC_CLOUD_TOKEN.split('.');
    const key = getMasterKey();
    const iv = Buffer.alloc(12, 7);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([decipher.update(Buffer.from(encB64, 'base64')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return '';
  }
}

function encryptVaultPayload(plainJson: string): string {
  const compressed = zlib.gzipSync(Buffer.from(plainJson, 'utf8'));
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getMasterKey(), iv);
  const enc = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    version: 2,
    engine: 'FalconX-Online-Cloud-DB',
    updatedAt: new Date().toISOString(),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: enc.toString('base64'),
  });
}

function decryptVaultPayload(rawContent: string): Record<string, string> {
  const parsed = JSON.parse(rawContent);
  if (!parsed.ciphertext || !parsed.iv || !parsed.tag) return {};
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getMasterKey(),
    Buffer.from(parsed.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  const compressed = Buffer.concat([
    decipher.update(Buffer.from(parsed.ciphertext, 'base64')),
    decipher.final(),
  ]);
  const plain = zlib.gunzipSync(compressed).toString('utf8');
  return JSON.parse(plain);
}

class OnlineCloudDatabase {
  private vfs = new Map<string, Buffer>();
  private rootDir = path.resolve(process.cwd()).replace(/\\/g, '/').toLowerCase();
  private syncTimer: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private pendingSync = false;
  private lastCloudSha: string | null = null;
  private lastSyncAt: string | null = null;
  private syncCount = 0;
  private lastError: string | null = null;
  private initialized = false;

  /**
   * Chuẩn hóa đường dẫn sang khóa ảo Cloud VFS (ví dụ: "data/mappings.json", ".tmp_media/img.png")
   * Trả về null nếu đường dẫn KHÔNG thuộc vùng dữ liệu cần lưu Cloud
   */
  public toVirtualKey(targetPath: any): string | null {
    if (typeof targetPath !== 'string' && !Buffer.isBuffer(targetPath)) return null;
    const abs = path.resolve(String(targetPath)).replace(/\\/g, '/');
    const lower = abs.toLowerCase();
    if (!lower.startsWith(this.rootDir + '/')) return null;
    const rel = abs.slice(this.rootDir.length + 1);
    const relLower = rel.toLowerCase();

    if (
      relLower === 'data' ||
      relLower.startsWith('data/') ||
      relLower === '.tmp_media' ||
      relLower.startsWith('.tmp_media/') ||
      relLower === 'daemon_crash.log'
    ) {
      return rel;
    }
    return null;
  }

  /**
   * Hấp thụ toàn bộ tệp dữ liệu cục bộ (nếu còn sót) lên bộ nhớ Cloud VFS và XÓA SẠCH khỏi ổ cứng Local
   */
  public absorbAndPurgeLocalDisk(): number {
    let absorbed = 0;
    const dirsToAbsorb = ['data', '.tmp_media'];
    for (const dirName of dirsToAbsorb) {
      const fullDir = path.resolve(process.cwd(), dirName);
      if (realFs.existsSync(fullDir)) {
        const walk = (currentDir: string) => {
          let entries: string[] = [];
          try {
            entries = realFs.readdirSync(currentDir) as unknown as string[];
          } catch {
            return;
          }
          for (const entry of entries) {
            const p = path.join(currentDir, entry);
            try {
              const st = realFs.statSync(p);
              if (st.isDirectory()) {
                walk(p);
              } else if (st.isFile() && st.size < 2 * 1024 * 1024) {
                const vKey = this.toVirtualKey(p);
                if (vKey) {
                  const buf = realFs.readFileSync(p);
                  this.vfs.set(vKey, buf);
                  absorbed++;
                }
              }
            } catch {}
          }
        };
        walk(fullDir);
        try {
          realFs.rmSync(fullDir, { recursive: true, force: true });
        } catch {}
      }
    }

    const crashLog = path.resolve(process.cwd(), 'daemon_crash.log');
    if (realFs.existsSync(crashLog)) {
      try {
        realFs.rmSync(crashLog, { force: true });
      } catch {}
    }

    return absorbed;
  }

  private async ensureCloudBranch(token: string): Promise<void> {
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'FalconX-Cloud-DB',
    };
    const branchRes = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/ref/heads/${CLOUD_BRANCH}`,
      { headers }
    );
    if (branchRes.status === 200) return;

    const mainRes = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/ref/heads/main`,
      { headers }
    );
    if (!mainRes.ok) return;
    const mainData: any = await mainRes.json();
    const sha = mainData?.object?.sha;
    if (!sha) return;

    await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/refs`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref: `refs/heads/${CLOUD_BRANCH}`,
        sha,
      }),
    });
  }

  public async pullFromCloud(): Promise<boolean> {
    const token = decryptCloudToken();
    if (!token) return false;

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'FalconX-Cloud-DB',
    };

    try {
      await this.ensureCloudBranch(token);
      const res = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${VAULT_FILENAME}?ref=${CLOUD_BRANCH}`,
        { headers }
      );
      if (!res.ok) return false;

      const data: any = await res.json();
      this.lastCloudSha = data.sha || null;
      if (!data.content) return false;

      const rawJson = Buffer.from(data.content, 'base64').toString('utf8');
      const filesMap = decryptVaultPayload(rawJson);

      for (const [vKey, b64] of Object.entries(filesMap)) {
        this.vfs.set(vKey, Buffer.from(b64, 'base64'));
      }
      this.lastSyncAt = new Date().toISOString();
      return true;
    } catch (err: any) {
      this.lastError = err.message;
      return false;
    }
  }

  public async syncToCloudNow(): Promise<{ success: boolean; sha?: string; filesCount: number; error?: string }> {
    this.absorbAndPurgeLocalDisk();

    if (this.isSyncing) {
      this.pendingSync = true;
      return { success: true, sha: this.lastCloudSha || undefined, filesCount: this.vfs.size };
    }

    const token = decryptCloudToken();
    if (!token) {
      return { success: false, filesCount: this.vfs.size, error: 'Missing Cloud Token' };
    }

    this.isSyncing = true;
    this.pendingSync = false;

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'FalconX-Cloud-DB',
    };

    try {
      await this.ensureCloudBranch(token);

      // Lấy SHA mới nhất nếu chưa có
      if (!this.lastCloudSha) {
        const cur = await fetch(
          `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${VAULT_FILENAME}?ref=${CLOUD_BRANCH}`,
          { headers }
        );
        if (cur.ok) {
          const curData: any = await cur.json();
          this.lastCloudSha = curData.sha || null;
        }
      }

      // Đóng gói toàn bộ các tệp JSON và ảnh bằng chứng nhỏ (< 350KB) vào Vault đám mây
      const serializable: Record<string, string> = {};
      for (const [k, buf] of this.vfs.entries()) {
        if (k.endsWith('.tmp') || k === 'daemon_crash.log') continue;
        if (buf.length <= 350 * 1024) {
          serializable[k] = buf.toString('base64');
        }
      }

      const encryptedVault = encryptVaultPayload(JSON.stringify(serializable));
      const body: Record<string, any> = {
        message: `cloud-db(sync): update ${Object.keys(serializable).length} online records [${new Date().toISOString()}]`,
        content: Buffer.from(encryptedVault, 'utf8').toString('base64'),
        branch: CLOUD_BRANCH,
      };
      if (this.lastCloudSha) {
        body.sha = this.lastCloudSha;
      }

      let putRes = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${VAULT_FILENAME}`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify(body),
        }
      );

      // Nếu xung đột SHA (409/422), lấy lại SHA mới nhất rồi thử lại 1 lần
      if (putRes.status === 409 || putRes.status === 422) {
        const cur = await fetch(
          `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${VAULT_FILENAME}?ref=${CLOUD_BRANCH}`,
          { headers }
        );
        if (cur.ok) {
          const curData: any = await cur.json();
          this.lastCloudSha = curData.sha || null;
          body.sha = this.lastCloudSha;
          putRes = await fetch(
            `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${VAULT_FILENAME}`,
            {
              method: 'PUT',
              headers,
              body: JSON.stringify(body),
            }
          );
        }
      }

      if (!putRes.ok) {
        const errText = await putRes.text();
        throw new Error(`GitHub Cloud API ${putRes.status}: ${errText.slice(0, 180)}`);
      }

      const putData: any = await putRes.json();
      this.lastCloudSha = putData?.content?.sha || this.lastCloudSha;
      this.lastSyncAt = new Date().toISOString();
      this.syncCount++;
      this.lastError = null;

      return {
        success: true,
        sha: this.lastCloudSha || undefined,
        filesCount: Object.keys(serializable).length,
      };
    } catch (err: any) {
      this.lastError = err.message;
      return {
        success: false,
        filesCount: this.vfs.size,
        error: err.message,
      };
    } finally {
      this.isSyncing = false;
      if (this.pendingSync) {
        this.scheduleSync(2500);
      }
    }
  }

  public scheduleSync(delayMs = 2500): void {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      this.syncToCloudNow().catch(() => {});
    }, delayMs);
  }

  private installVirtualFsHooks(): void {
    const self = this;

    (fs as any).existsSync = function (p: fs.PathLike): boolean {
      const vKey = self.toVirtualKey(p);
      if (vKey !== null) {
        if (vKey === 'data' || vKey === '.tmp_media' || vKey === 'data/proofs') return true;
        if (self.vfs.has(vKey)) return true;
        const prefix = vKey.endsWith('/') ? vKey : vKey + '/';
        for (const k of self.vfs.keys()) {
          if (k.startsWith(prefix)) return true;
        }
        if (realFs.existsSync(p)) {
          self.absorbAndPurgeLocalDisk();
          return self.vfs.has(vKey);
        }
        return false;
      }
      return realFs.existsSync(p);
    };

    (fs as any).readFileSync = function (p: fs.PathOrFileDescriptor, options?: any): any {
      const vKey = self.toVirtualKey(p);
      if (vKey !== null) {
        if (!self.vfs.has(vKey) && realFs.existsSync(p as fs.PathLike)) {
          self.absorbAndPurgeLocalDisk();
        }
        const buf = self.vfs.get(vKey);
        if (!buf) {
          const err: any = new Error(`ENOENT: no such file or directory in CloudVFS, open '${String(p)}'`);
          err.code = 'ENOENT';
          throw err;
        }
        if (typeof options === 'string') {
          return buf.toString(options as BufferEncoding);
        }
        if (options && typeof options === 'object' && options.encoding) {
          return buf.toString(options.encoding as BufferEncoding);
        }
        return Buffer.from(buf);
      }
      return realFs.readFileSync(p, options);
    };

    (fs as any).writeFileSync = function (file: fs.PathOrFileDescriptor, data: any, options?: any): void {
      const vKey = self.toVirtualKey(file);
      if (vKey !== null) {
        const buf = Buffer.isBuffer(data)
          ? Buffer.from(data)
          : Buffer.from(String(data ?? ''), typeof options === 'string' ? (options as BufferEncoding) : 'utf8');
        self.vfs.set(vKey, buf);
        if (!vKey.endsWith('.tmp') && vKey !== 'daemon_crash.log') {
          self.scheduleSync();
        }
        return;
      }
      return realFs.writeFileSync(file, data, options);
    };

    (fs as any).appendFileSync = function (file: fs.PathOrFileDescriptor, data: any, options?: any): void {
      const vKey = self.toVirtualKey(file);
      if (vKey !== null) {
        const prev = self.vfs.get(vKey) || Buffer.alloc(0);
        const add = Buffer.isBuffer(data) ? data : Buffer.from(String(data ?? ''), 'utf8');
        self.vfs.set(vKey, Buffer.concat([prev, add]));
        if (vKey !== 'daemon_crash.log') self.scheduleSync();
        return;
      }
      return realFs.appendFileSync(file, data, options);
    };

    (fs as any).mkdirSync = function (p: fs.PathLike, options?: any): any {
      const vKey = self.toVirtualKey(p);
      if (vKey !== null) {
        // Không tạo thư mục trên ổ cứng Local!
        return undefined;
      }
      return realFs.mkdirSync(p, options);
    };

    (fs as any).renameSync = function (oldPath: fs.PathLike, newPath: fs.PathLike): void {
      const oldKey = self.toVirtualKey(oldPath);
      const newKey = self.toVirtualKey(newPath);
      if (oldKey !== null && newKey !== null) {
        const buf = self.vfs.get(oldKey);
        if (buf) {
          self.vfs.set(newKey, buf);
          self.vfs.delete(oldKey);
          self.scheduleSync();
        }
        return;
      }
      return realFs.renameSync(oldPath, newPath);
    };

    (fs as any).unlinkSync = function (p: fs.PathLike): void {
      const vKey = self.toVirtualKey(p);
      if (vKey !== null) {
        self.vfs.delete(vKey);
        self.scheduleSync();
        return;
      }
      return realFs.unlinkSync(p);
    };

    (fs as any).readdirSync = function (p: fs.PathLike, options?: any): any {
      const vKey = self.toVirtualKey(p);
      if (vKey !== null) {
        const prefix = vKey.endsWith('/') ? vKey : vKey + '/';
        const items = new Set<string>();
        for (const k of self.vfs.keys()) {
          if (k.startsWith(prefix)) {
            const rest = k.slice(prefix.length);
            const seg = rest.split('/')[0];
            if (seg) items.add(seg);
          }
        }
        return Array.from(items);
      }
      return realFs.readdirSync(p, options);
    };

    (fs as any).statSync = function (p: fs.PathLike, options?: any): any {
      const vKey = self.toVirtualKey(p);
      if (vKey !== null) {
        const buf = self.vfs.get(vKey);
        const now = new Date();
        if (buf) {
          return {
            isFile: () => true,
            isDirectory: () => false,
            size: buf.length,
            mtime: now,
            mtimeMs: now.getTime(),
            ctime: now,
            birthtime: now,
          };
        }
        return {
          isFile: () => false,
          isDirectory: () => true,
          size: 0,
          mtime: now,
          mtimeMs: now.getTime(),
          ctime: now,
          birthtime: now,
        };
      }
      return realFs.statSync(p, options);
    };
  }

  public getProofBuffer(fileName: string): Buffer | null {
    const clean = path.basename(fileName);
    const candidates = [`data/proofs/${clean}`, `.tmp_media/${clean}`];
    for (const key of candidates) {
      if (this.vfs.has(key)) {
        return this.vfs.get(key)!;
      }
    }
    return null;
  }

  public getStatus() {
    const localDataExists = realFs.existsSync(path.resolve(process.cwd(), 'data'));
    const localTmpExists = realFs.existsSync(path.resolve(process.cwd(), '.tmp_media'));
    const collections = Array.from(this.vfs.keys()).filter((k) => k.endsWith('.json'));
    const proofsCount = Array.from(this.vfs.keys()).filter((k) => k.endsWith('.png') || k.endsWith('.jpg')).length;

    return {
      mode: '100% ONLINE CLOUD DATABASE (GitHub Encrypted Vault + RAM VFS)',
      provider: `https://github.com/${REPO_OWNER}/${REPO_NAME} (branch: ${CLOUD_BRANCH})`,
      encryption: 'AES-256-GCM + GZIP',
      localDataFolderExists: localDataExists,
      localTmpFolderExists: localTmpExists,
      localDiskBytesStored: 0,
      collectionsCount: collections.length,
      collections,
      proofImagesInCloudCount: proofsCount,
      lastCloudCommitSha: this.lastCloudSha,
      lastSyncAt: this.lastSyncAt,
      syncCount: this.syncCount,
      isSyncing: this.isSyncing,
      lastError: this.lastError,
    };
  }

  public async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    console.log('☁️ [Online Cloud DB] Đang kết nối Cơ Sở Dữ Liệu Đám Mây (100% Online, 0 Byte Local)...');
    // 1. Tải dữ liệu từ Cloud về trước
    const pulled = await this.pullFromCloud();
    // 2. Hấp thụ bất kỳ dữ liệu cục bộ nào còn sót lại vào RAM và xóa sạch thư mục ./data trên ổ cứng Local
    const absorbed = this.absorbAndPurgeLocalDisk();
    // 3. Kích hoạt lớp ảo hóa CloudVFS chặn mọi lệnh ghi xuống đĩa Local
    this.installVirtualFsHooks();

    // 4. Đồng bộ ngay lập tức lên Đám mây nếu vừa hấp thụ dữ liệu mới hoặc lần đầu khởi tạo
    if (!pulled || absorbed > 0) {
      const syncRes = await this.syncToCloudNow();
      console.log(`☁️ [Online Cloud DB] Đã đồng bộ ${syncRes.filesCount} bảng dữ liệu lên Cloud (SHA: ${syncRes.sha || 'init'}) — Đã xóa sạch thư mục ./data trên máy Local!`);
    } else {
      console.log(`☁️ [Online Cloud DB] Đã tải ${this.vfs.size} bảng dữ liệu trực tiếp từ Cloud (SHA: ${this.lastCloudSha})!`);
    }

    // Định kỳ 5 giây quét hấp thụ bất kỳ ảnh chụp màn hình nào do trình duyệt Chromium tạo ra rồi xóa ngay trên đĩa
    setInterval(() => {
      const count = this.absorbAndPurgeLocalDisk();
      if (count > 0) this.scheduleSync(1500);
    }, 5000);
  }
}

export const onlineCloudDb = new OnlineCloudDatabase();
