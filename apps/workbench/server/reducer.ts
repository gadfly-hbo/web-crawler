/**
 * 任务状态机 Reducer：纯函数，负责根据 CrawlEvent 推进 TaskRecord 状态。
 */
import type { CrawlEvent, CrawlSummary } from 'cninfo-reports/events';
import type { TaskFailure, TaskRecord, TaskStatus } from '../shared/task.js';

export function classifyDone(
  task: Pick<TaskRecord, 'dryRun'>,
  summary?: Partial<CrawlSummary> | Record<string, unknown>,
): TaskStatus {
  const failed = Number(summary?.failed ?? 0);
  if (failed === 0) return 'succeeded';
  // 预览任务不产文件，以匹配数判断是否有结果；采集任务以「下载+跳过」判断
  const produced = task.dryRun
    ? Number(summary?.matched ?? 0)
    : Number(summary?.downloaded ?? 0) + Number(summary?.skipped ?? 0);
  return produced > 0 ? 'partial' : 'failed';
}

export function applyEvent(task: TaskRecord, ev: CrawlEvent): TaskRecord {
  switch (ev.type) {
    case 'start':
      return {
        ...task,
        totalCompanies: Number(ev.totalCompanies ?? 0),
      };

    case 'company':
      return {
        ...task,
        companyIndex: Number(ev.index ?? 0),
        currentCompany: String(ev.name ?? ''),
      };

    case 'file': {
      const counts = { ...task.counts };
      const failures = [...task.failures];
      if (ev.status === 'downloaded') {
        counts.downloaded++;
      } else if (ev.status === 'skipped') {
        counts.skipped++;
      } else if (ev.status === 'failed') {
        counts.failed++;
        const item: TaskFailure = {
          code: ev.code != null ? String(ev.code) : undefined,
          name: ev.name != null ? String(ev.name) : undefined,
          reason: String(ev.reason ?? '未知原因'),
        };
        if (ev.title != null) item.title = String(ev.title);
        failures.push(item);
      }
      return { ...task, counts, failures };
    }

    case 'queryError':
      return {
        ...task,
        counts: { ...task.counts, failed: task.counts.failed + 1 },
        failures: [
          ...task.failures,
          { target: String(ev.target ?? ''), reason: String(ev.reason ?? '未知原因') },
        ],
      };

    case 'preview':
      return {
        ...task,
        preview: {
          companies: Number(ev.companies ?? 0),
          reports: Number(ev.reports ?? 0),
        },
      };

    case 'done': {
      const summary = ev.summary;
      const nextStatus = task.status === 'running' ? classifyDone(task, summary) : task.status;
      return {
        ...task,
        status: nextStatus,
        counts: {
          ...task.counts,
          matched: Number(summary?.matched ?? 0),
        },
        finishedAt: new Date().toISOString(),
      };
    }

    case 'error': {
      const nextStatus =
        task.status === 'running' || task.status === 'queued' ? 'failed' : task.status;
      return {
        ...task,
        status: nextStatus,
        error: String(ev.message ?? '未知错误'),
        finishedAt: new Date().toISOString(),
      };
    }

    default:
      return task;
  }
}
