/** 任务队列：串行调度 + 状态机 + JSON 落盘持久化。Runner 是唯一的进程边界 seam。 */
import { EventEmitter } from 'node:events';
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { summarizeTask, type TaskParams } from '../shared/task-params.js';
import type { TaskRecord, TaskStatus } from '../shared/task.js';

export type { TaskCounts, TaskFailure, TaskRecord, TaskStatus } from '../shared/task.js';

export interface RunningHandle {
  done: Promise<unknown>;
  cancel: () => void;
}

/** Runner：启动一次采集，逐行回吐爬虫 stdout 的 NDJSON 原始行。 */
export type Runner = (task: TaskRecord, emit: (line: string) => void) => RunningHandle;

export class TaskQueue {
  private readonly runner: Runner;
  private readonly dataRoot: string;
  private readonly tasks = new Map<string, TaskRecord>();
  private active: { id: string; handle: RunningHandle } | null = null;
  /** 'update' (task) 状态变化；'log' (taskId, line) 原始日志行 */
  readonly events = new EventEmitter();

  constructor(opts: { runner: Runner; dataRoot: string }) {
    this.runner = opts.runner;
    this.dataRoot = opts.dataRoot;
    this.events.setMaxListeners(100);
  }

  private get storeDir(): string {
    return path.join(this.dataRoot, 'workbench');
  }

  private get logsDir(): string {
    return path.join(this.storeDir, 'logs');
  }

  private get storeFile(): string {
    return path.join(this.storeDir, 'tasks.json');
  }

  async init(): Promise<void> {
    await mkdir(this.logsDir, { recursive: true });
    let stored: TaskRecord[] = [];
    try {
      stored = JSON.parse(await readFile(this.storeFile, 'utf8')) as TaskRecord[];
    } catch {
      stored = [];
    }
    for (const t of stored) {
      // 服务重启时仍处于 running 的任务实际已随进程死亡，如实标记中断
      if (t.status === 'running') {
        t.status = 'failed';
        t.error = '服务重启导致任务中断';
        t.finishedAt = new Date().toISOString();
      }
      this.tasks.set(t.id, t);
    }
    if (stored.some((t) => t.error === '服务重启导致任务中断')) await this.persist();
    this.pump();
  }

  list(): TaskRecord[] {
    return [...this.tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): TaskRecord | undefined {
    return this.tasks.get(id);
  }

  async create(params: TaskParams, dryRun: boolean): Promise<TaskRecord> {
    const now = new Date();
    const id = `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const task: TaskRecord = {
      id,
      title: summarizeTask(params, dryRun),
      params,
      dryRun,
      status: 'queued',
      createdAt: now.toISOString(),
      totalCompanies: 0,
      companyIndex: 0,
      counts: { downloaded: 0, skipped: 0, failed: 0, matched: 0 },
      failures: [],
      outDir: path.join(this.dataRoot, 'cninfo-reports', id),
      logFile: path.join(this.logsDir, `${id}.ndjson`),
    };
    this.tasks.set(id, task);
    await this.persist();
    this.events.emit('update', task);
    this.pump();
    return task;
  }

  async cancel(id: string): Promise<TaskRecord | undefined> {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    if (task.status === 'queued') {
      task.status = 'canceled';
      task.finishedAt = new Date().toISOString();
      await this.persist();
      this.events.emit('update', task);
      return task;
    }
    if (task.status === 'running' && this.active?.id === id) {
      task.status = 'canceled';
      task.finishedAt = new Date().toISOString();
      this.active.handle.cancel();
      await this.persist();
      this.events.emit('update', task);
      return task;
    }
    return task;
  }

  private pump(): void {
    if (this.active) return;
    const next = this.list()
      .filter((t) => t.status === 'queued')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (!next) return;
    next.status = 'running';
    next.startedAt = new Date().toISOString();
    this.active = { id: next.id, handle: this.runner(next, (line) => this.onLogLine(next, line)) };
    void this.persist();
    this.events.emit('update', next);
    this.active.handle.done
      .then(() => {
        this.active = null;
        this.reportDone(next);
        this.pump();
      })
      .catch((err) => {
        // Runner 的 done 拒绝（接口未约束实现）：如实标失败并继续调度，队列不停摆
        this.active = null;
        if (next.status === 'running') {
          next.status = 'failed';
          next.error = `采集进程异常：${err instanceof Error ? err.message : String(err)}`;
          next.finishedAt = new Date().toISOString();
        }
        this.reportDone(next);
        this.pump();
      });
  }

  /** 终态落盘；磁盘错误不升级为进程崩溃（任务内存态已正确，下次启动从磁盘恢复近似状态）。 */
  private reportDone(task: TaskRecord): void {
    void this.onProcessDone(task).catch((err) => {
      console.error('[workbench] 任务状态落盘失败：', err);
    });
  }

  private onLogLine(task: TaskRecord, line: string): void {
    // 追加写入进入串行链，close() 可等待其全部落盘
    this.logChain = this.logChain.then(() => appendFile(task.logFile, line + '\n', 'utf8')).catch(() => {});
    const seq = (this.logSeq.get(task.id) ?? 0) + 1;
    this.logSeq.set(task.id, seq);
    this.events.emit('log', task.id, line, seq);
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return; // 非 JSON 行只进日志，不驱动状态
    }
    switch (ev.type) {
      case 'start':
        task.totalCompanies = Number(ev.totalCompanies ?? 0);
        break;
      case 'company':
        task.companyIndex = Number(ev.index ?? 0);
        task.currentCompany = String(ev.name ?? '');
        break;
      case 'file': {
        if (ev.status === 'downloaded') task.counts.downloaded++;
        else if (ev.status === 'skipped') task.counts.skipped++;
        else if (ev.status === 'failed') {
          task.counts.failed++;
          task.failures.push({
            code: ev.code != null ? String(ev.code) : undefined,
            name: ev.name != null ? String(ev.name) : undefined,
            reason: String(ev.reason ?? '未知原因'),
          });
        }
        break;
      }
      case 'queryError':
        task.counts.failed++;
        task.failures.push({ target: String(ev.target ?? ''), reason: String(ev.reason ?? '未知原因') });
        break;
      case 'preview':
        task.preview = { companies: Number(ev.companies ?? 0), reports: Number(ev.reports ?? 0) };
        break;
      case 'done': {
        const summary = (ev.summary ?? {}) as Record<string, unknown>;
        task.counts.matched = Number(summary.matched ?? 0);
        if (task.status === 'running') task.status = this.classifyDone(task, summary);
        task.finishedAt = new Date().toISOString();
        break;
      }
      case 'error':
        if (task.status === 'running' || task.status === 'queued') task.status = 'failed';
        task.error = String(ev.message ?? '未知错误');
        task.finishedAt = new Date().toISOString();
        break;
      default:
        return; // 未知事件不通知，减少噪音
    }
    this.events.emit('update', task);
  }

  private classifyDone(task: TaskRecord, summary: Record<string, unknown>): TaskStatus {
    const failed = Number(summary.failed ?? 0);
    if (failed === 0) return 'succeeded';
    // 预览任务不产文件，以匹配数判断是否有结果；采集任务以「下载+跳过」判断
    const produced = task.dryRun
      ? Number(summary.matched ?? 0)
      : Number(summary.downloaded ?? 0) + Number(summary.skipped ?? 0);
    return produced > 0 ? 'partial' : 'failed';
  }

  private async onProcessDone(task: TaskRecord): Promise<void> {
    if (task.status === 'running') {
      // 进程结束但没有 done/error 事件：异常退出
      task.status = 'failed';
      task.error = task.error ?? '采集进程异常退出（未产生完成事件）';
      task.finishedAt = new Date().toISOString();
    }
    await this.persist();
    this.events.emit('update', task);
  }

  private writeChain: Promise<void> = Promise.resolve();
  private logChain: Promise<void> = Promise.resolve();
  private readonly logSeq = new Map<string, number>();

  /** 等待所有已触发的日志/状态写盘完成（测试与关停时使用）。 */
  async close(): Promise<void> {
    await this.logChain;
    await this.writeChain;
  }

  /** 落盘串行化：并发 persist 只保留最新一次写入的顺序，tmp  rename 不竞争。 */
  private persist(): Promise<void> {
    const p = this.writeChain.then(async () => {
      const tmp = this.storeFile + '.tmp';
      await writeFile(tmp, JSON.stringify(this.list(), null, 2), 'utf8');
      await rename(tmp, this.storeFile);
    });
    this.writeChain = p.catch(() => {});
    return p;
  }
}
