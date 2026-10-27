import fs from 'fs';
import path from 'path';
import { getDefaultAccount, getAllAccounts } from '../db/store.js';

export type TaskType =
  | 'post_group'
  | 'first_comment'
  | 'scan_members'
  | 'auto_friend'
  | 'react_story'
  | 'react_post';

export interface TaskProof {
  id: string;
  timestamp: string;
  type: TaskType;
  typeLabel: string;
  accountName: string;
  targetName: string;
  targetUrl?: string;
  status: 'success' | 'failed';
  message: string;
  screenshotUrl?: string;
}

interface DayCounter {
  success: number;
  failed: number;
  lastRunAt: string | null;
  lastAccount: string | null;
}

interface CounterFile {
  date: string;
  counters: Record<TaskType, DayCounter>;
}

const TASK_META: Record<TaskType, { name: string; icon: string; idleText: string }> = {
  post_group: { name: '1. Đăng Bài Vào Nhóm / Trang', icon: '📝', idleText: 'Chưa đăng bài nào hôm nay' },
  first_comment: { name: '2. Bình Luận Mồi (First Comment)', icon: '💬', idleText: 'Chưa có bình luận nào hôm nay' },
  scan_members: { name: '3. Quét Thành Viên Mới (Radar)', icon: '🔍', idleText: 'Chưa quét nhóm nào hôm nay' },
  auto_friend: { name: '4. Gửi Lời Mời Kết Bạn', icon: '🤝', idleText: 'Chưa gửi lời mời nào hôm nay' },
  react_story: { name: '5. Thả Tim Story', icon: '📱', idleText: 'Chưa thả tim Story nào hôm nay' },
  react_post: { name: '6. Thích / Tim Bài Viết', icon: '❤️', idleText: 'Chưa tương tác bài viết nào hôm nay' },
};

const proofsFilePath = path.resolve('./data/task_proofs.json');
const countersFilePath = path.resolve('./data/task_counters.json');
const orchestrationStateFile = path.resolve('./data/orchestration_state.json');

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyCounters(): Record<TaskType, DayCounter> {
  const make = (): DayCounter => ({ success: 0, failed: 0, lastRunAt: null, lastAccount: null });
  return {
    post_group: make(),
    first_comment: make(),
    scan_members: make(),
    auto_friend: make(),
    react_story: make(),
    react_post: make(),
  };
}

/**
 * Trung tâm điều phối: CHỈ ghi nhận những thao tác thật đã được Facebook xác nhận.
 * Không có số liệu mẫu / số liệu giả. Chưa chạy thì hiển thị 0.
 */
class OrchestrationService {
  private proofs: TaskProof[] = [];
  private counterFile: CounterFile = { date: todayKey(), counters: emptyCounters() };
  private autopilotEnabled = true;

  constructor() {
    this.loadState();
  }

  private loadState() {
    try {
      if (fs.existsSync(proofsFilePath)) {
        const parsed = JSON.parse(fs.readFileSync(proofsFilePath, 'utf8'));
        // Loại bỏ mọi bản ghi mẫu cũ (không có dữ liệu thật phía sau)
        this.proofs = (Array.isArray(parsed) ? parsed : []).filter(
          (p: any) => !/^prf_/.test(p?.id) || p?.__real === true
        );
      }
    } catch {
      this.proofs = [];
    }

    try {
      if (fs.existsSync(countersFilePath)) {
        const parsed = JSON.parse(fs.readFileSync(countersFilePath, 'utf8')) as CounterFile;
        if (parsed?.date && parsed.counters) {
          this.counterFile = { date: parsed.date, counters: { ...emptyCounters(), ...parsed.counters } };
        }
      }
    } catch {}

    try {
      if (fs.existsSync(orchestrationStateFile)) {
        const data = JSON.parse(fs.readFileSync(orchestrationStateFile, 'utf8'));
        if (typeof data.autopilotEnabled === 'boolean') this.autopilotEnabled = data.autopilotEnabled;
      }
    } catch {}

    this.rollDayIfNeeded();
  }

  private rollDayIfNeeded() {
    const key = todayKey();
    if (this.counterFile.date !== key) {
      this.counterFile = { date: key, counters: emptyCounters() };
      this.saveState();
    }
  }

  private saveState() {
    try {
      fs.mkdirSync(path.dirname(proofsFilePath), { recursive: true });
      fs.writeFileSync(proofsFilePath, JSON.stringify(this.proofs.slice(0, 200), null, 2), 'utf8');
      fs.writeFileSync(countersFilePath, JSON.stringify(this.counterFile, null, 2), 'utf8');
      fs.writeFileSync(
        orchestrationStateFile,
        JSON.stringify({ autopilotEnabled: this.autopilotEnabled, lastUpdated: new Date().toISOString() }, null, 2),
        'utf8'
      );
    } catch {}
  }

  /**
   * Ghi nhận MỘT thao tác thật. Gọi sau khi Facebook đã xác nhận (success) hoặc thao tác lỗi (failed).
   * `count` cho phép ghi nhận nhiều đơn vị cùng lúc (vd: quét thấy N thành viên mới).
   */
  public record(
    type: TaskType,
    data: {
      accountName?: string;
      targetName: string;
      targetUrl?: string;
      status: 'success' | 'failed';
      message: string;
      screenshotUrl?: string;
      count?: number;
    }
  ): TaskProof {
    this.rollDayIfNeeded();
    const counter = this.counterFile.counters[type];
    const units = Math.max(1, data.count ?? 1);
    if (data.status === 'success') counter.success += units;
    else counter.failed += 1;
    counter.lastRunAt = new Date().toISOString();
    counter.lastAccount = data.accountName || getDefaultAccount()?.name || null;

    const proof: TaskProof & { __real: true } = {
      id: `prf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      type,
      typeLabel: TASK_META[type].name.replace(/^\d+\.\s*/, ''),
      accountName: counter.lastAccount || 'Tài khoản Facebook',
      targetName: data.targetName,
      targetUrl: data.targetUrl,
      status: data.status,
      message: data.message,
      screenshotUrl: data.screenshotUrl,
      __real: true,
    };
    this.proofs.unshift(proof);
    if (this.proofs.length > 200) this.proofs = this.proofs.slice(0, 200);
    this.saveState();
    return proof;
  }

  public getProofs(): TaskProof[] {
    return this.proofs;
  }

  public toggleAutopilot(enable?: boolean): boolean {
    this.autopilotEnabled = typeof enable === 'boolean' ? enable : !this.autopilotEnabled;
    this.saveState();
    return this.autopilotEnabled;
  }

  public getStatus() {
    this.rollDayIfNeeded();
    const defaultAcc = getDefaultAccount();
    const allAccs = getAllAccounts();
    const accountNames = allAccs.map((a: any) => a.name);

    const pipelines: Record<string, any> = {};
    (Object.keys(TASK_META) as TaskType[]).forEach((type) => {
      const c = this.counterFile.counters[type];
      const total = c.success + c.failed;
      pipelines[type] = {
        id: type,
        name: TASK_META[type].name,
        icon: TASK_META[type].icon,
        success: c.success,
        failed: c.failed,
        todayCount: c.success,
        statusText: total === 0 ? TASK_META[type].idleText : `${c.success} thành công · ${c.failed} lỗi`,
        assignedAccount: c.lastAccount || defaultAcc?.name || '—',
        lastRunAt: c.lastRunAt,
      };
    });

    return {
      autopilotEnabled: this.autopilotEnabled,
      date: this.counterFile.date,
      pipelines,
      accounts: accountNames,
      proofs: this.proofs.slice(0, 10),
      lastUpdated: new Date().toISOString(),
    };
  }
}

export const orchestrationService = new OrchestrationService();
