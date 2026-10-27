import http from 'http';
import https from 'https';
import { URL } from 'url';
import { testProxyNetwork } from '../core/browser-session.js';

/**
 * Trạng thái kết quả chuẩn hóa cho mọi tác vụ KudoX
 */
export type ExecutionOutcome =
  | 'verified_success'           // Thành công có bằng chứng xác minh
  | 'partial_success'            // Thành công một phần (một số đích lỗi)
  | 'pending_admin_approval'     // Đã gửi nhưng đang chờ duyệt (nhóm kiểm duyệt)
  | 'uncertain'                  // Chưa xác minh được kết quả sau submit
  | 'session_checkpoint_required'// Gặp checkpoint hoặc hết phiên đăng nhập
  | 'rate_limited'               // Bị Facebook chặn hành động (spam / rate limit)
  | 'failed'                     // Lỗi rõ ràng có nguyên nhân cụ thể
  | 'cancelled';                 // Tác vụ đã bị người dùng hủy

export interface TargetReceipt {
  targetId: string;
  targetName?: string;
  targetType: 'group' | 'profile' | 'page' | 'post' | 'story';
  canonicalUrl?: string;
  outcome: ExecutionOutcome;
  resultUrl?: string;
  postId?: string;
  commentId?: string;
  evidenceText?: string;
  errorMessage?: string;
  observedAt: string;
  durationMs?: number;
  screenshotPath?: string;
}

export interface ActionResult {
  actionId: string;
  actionType: 'post' | 'comment' | 'reply' | 'friend_request' | 'reaction' | 'member_scan';
  accountId: string;
  accountName: string;
  overallOutcome: ExecutionOutcome;
  receipts: TargetReceipt[];
  summary: string;
  startedAt: string;
  completedAt: string;
}

/**
 * Chuyển outcome thành nhãn hiển thị trực quan cho Telegram
 */
export function getOutcomeBadge(outcome: ExecutionOutcome): string {
  switch (outcome) {
    case 'verified_success':
      return '✅ Đã xác minh';
    case 'partial_success':
      return '⚠️ Thành công một phần';
    case 'pending_admin_approval':
      return '⏳ Chờ QTV nhóm duyệt';
    case 'uncertain':
      return '❓ Chưa xác minh (Cần kiểm tra)';
    case 'session_checkpoint_required':
      return '🔒 Cần xử lý phiên / Checkpoint';
    case 'rate_limited':
      return '🚫 Bị Facebook giới hạn';
    case 'failed':
      return '❌ Thất bại';
    case 'cancelled':
      return '🛑 Đã hủy';
    default:
      return '⚪ Không xác định';
  }
}

/**
 * Đo độ trễ mạng thực tế (Ping latency) qua kết nối trực tiếp hoặc Proxy
 * Sử dụng engine kiểm tra đa tầng từ browser-session
 */
export async function measureRealPing(proxyUrl?: string): Promise<{
  status: 'live' | 'slow' | 'error';
  latencyMs: number;
  ip?: string;
  country?: string;
  errorMessage?: string;
  isLeakingHostIp?: boolean;
}> {
  try {
    const res = await testProxyNetwork(proxyUrl, 9000);
    if (!res.alive) {
      return {
        status: 'error',
        latencyMs: res.latencyMs,
        errorMessage: res.error || 'Proxy không phản hồi',
        isLeakingHostIp: false,
      };
    }
    const status = res.latencyMs < 1000 ? 'live' : 'slow';
    return {
      status,
      latencyMs: res.latencyMs,
      ip: res.ip,
      country: res.country,
      isLeakingHostIp: res.isLeakingHostIp,
    };
  } catch (err: any) {
    return {
      status: 'error',
      latencyMs: 9999,
      errorMessage: err.message || 'Lỗi kiểm tra mạng',
      isLeakingHostIp: false,
    };
  }
}
