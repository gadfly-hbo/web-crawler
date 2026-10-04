/** 共享：任务记录类型与状态文案（server 与 web 共用；web 不可 import server 侧文件）。 */
import type { TaskParams } from './task-params.js';

export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'canceled';

export const STATUS_LABELS: Record<TaskStatus, string> = {
  queued: '排队中',
  running: '运行中',
  succeeded: '已完成',
  partial: '部分失败',
  failed: '失败',
  canceled: '已取消',
};

/** 状态 → 语义色组（对应 DESIGN.md 的 chip 语义：queue=进行中/排队，ok=成功，warn=部分，fail=失败）。 */
export const STATUS_TONES: Record<TaskStatus, 'queue' | 'ok' | 'warn' | 'fail' | 'muted'> = {
  queued: 'queue',
  running: 'queue',
  succeeded: 'ok',
  partial: 'warn',
  failed: 'fail',
  canceled: 'muted',
};

export interface TaskFailure {
  code?: string;
  name?: string;
  target?: string;
  title?: string;
  reason: string;
}

export interface TaskCounts {
  downloaded: number;
  skipped: number;
  failed: number;
  matched: number;
}

export interface TaskRecord {
  id: string;
  title: string;
  params: TaskParams;
  dryRun: boolean;
  status: TaskStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  totalCompanies: number;
  companyIndex: number;
  currentCompany?: string;
  counts: TaskCounts;
  preview?: { companies: number; reports: number };
  failures: TaskFailure[];
  outDir: string;
  logFile: string;
  error?: string;
}
