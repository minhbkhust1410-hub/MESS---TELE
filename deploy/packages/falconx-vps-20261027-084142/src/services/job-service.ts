import fs from 'fs';
import path from 'path';
import { TargetReceipt, ExecutionOutcome } from './action-result.js';

export interface PersistentJob {
  id: string;
  actionType: 'publish_post' | 'comment_post' | 'reply_comment' | 'add_friend' | 'reaction' | 'member_scan';
  creatorTelegramId?: number;
  creatorName?: string;
  chatId?: number;
  topicId?: number;
  accountId: string;
  accountName?: string;
  targetIds?: string[];
  payload: any;
  payloadVersion: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  overallOutcome?: ExecutionOutcome;
  receipts: TargetReceipt[];
  error?: string;
  createdAt: string;
}

interface JobsDatabase {
  jobs: PersistentJob[];
}

const JOBS_FILE = path.resolve('./data/jobs_db.json');

let cachedDb: JobsDatabase | null = null;
let saveTimer: NodeJS.Timeout | null = null;

function loadJobsDb(): JobsDatabase {
  if (cachedDb) return cachedDb;
  try {
    if (fs.existsSync(JOBS_FILE)) {
      cachedDb = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf-8'));
    } else {
      cachedDb = { jobs: [] };
    }
  } catch {
    cachedDb = { jobs: [] };
  }
  return cachedDb!;
}

function persistJobsDb(): void {
  if (!cachedDb) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const dir = path.dirname(JOBS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(JOBS_FILE, JSON.stringify(cachedDb, null, 2), 'utf-8');
    } catch (e: any) {
      console.error('[JobService] Lỗi ghi file jobs:', e.message);
    }
  }, 300);
}

export class JobService {
  /**
   * Tạo Job mới lưu trữ bền vững
   */
  public static createJob(params: {
    actionType: PersistentJob['actionType'];
    creatorTelegramId?: number;
    creatorName?: string;
    chatId?: number;
    topicId?: number;
    accountId: string;
    accountName?: string;
    targetIds?: string[];
    payload: any;
    scheduledAt?: string;
  }): PersistentJob {
    const db = loadJobsDb();
    const id = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const job: PersistentJob = {
      id,
      actionType: params.actionType,
      creatorTelegramId: params.creatorTelegramId,
      creatorName: params.creatorName,
      chatId: params.chatId,
      topicId: params.topicId,
      accountId: params.accountId,
      accountName: params.accountName,
      targetIds: params.targetIds,
      payload: params.payload,
      payloadVersion: 1,
      status: 'pending',
      scheduledAt: params.scheduledAt,
      receipts: [],
      createdAt: new Date().toISOString(),
    };

    db.jobs.push(job);
    persistJobsDb();
    return job;
  }

  /**
   * Khóa thực thi nguyên tử (Atomic Claim):
   * Chỉ cho phép chạy nếu job đang ở trạng thái 'pending'.
   * Trả về true nếu nhận việc thành công, false nếu job đã đang chạy hoặc đã xong.
   */
  public static claimJobForExecution(jobId: string): boolean {
    const db = loadJobsDb();
    const job = db.jobs.find((j) => j.id === jobId);
    if (!job) return false;

    if (job.status === 'running' || job.status === 'completed') {
      console.warn(`[JobService] Từ chối thực thi lại: Job ${jobId} đang ở trạng thái ${job.status}`);
      return false;
    }

    job.status = 'running';
    job.startedAt = new Date().toISOString();
    persistJobsDb();
    return true;
  }

  /**
   * Cập nhật kết quả sau khi hoàn thành
   */
  public static finishJob(
    jobId: string,
    outcome: ExecutionOutcome,
    receipts: TargetReceipt[],
    error?: string
  ): PersistentJob | null {
    const db = loadJobsDb();
    const job = db.jobs.find((j) => j.id === jobId);
    if (!job) return null;

    job.status = outcome === 'failed' ? 'failed' : 'completed';
    job.completedAt = new Date().toISOString();
    job.overallOutcome = outcome;
    job.receipts = receipts;
    if (error) job.error = error;

    persistJobsDb();
    return job;
  }

  /**
   * Lấy job theo ID
   */
  public static getJob(jobId: string): PersistentJob | undefined {
    const db = loadJobsDb();
    return db.jobs.find((j) => j.id === jobId);
  }

  /**
   * Lấy danh sách jobs theo điều kiện
   */
  public static getJobs(filter?: {
    accountId?: string;
    actionType?: PersistentJob['actionType'];
    status?: PersistentJob['status'];
    limit?: number;
  }): PersistentJob[] {
    const db = loadJobsDb();
    let list = [...db.jobs];
    if (filter?.accountId) list = list.filter((j) => j.accountId === filter.accountId);
    if (filter?.actionType) list = list.filter((j) => j.actionType === filter.actionType);
    if (filter?.status) list = list.filter((j) => j.status === filter.status);

    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return filter?.limit ? list.slice(0, filter.limit) : list;
  }

  /**
   * Hủy một job chưa chạy
   */
  public static cancelJob(jobId: string): boolean {
    const db = loadJobsDb();
    const job = db.jobs.find((j) => j.id === jobId);
    if (!job || job.status === 'completed' || job.status === 'running') return false;
    job.status = 'cancelled';
    persistJobsDb();
    return true;
  }
}
