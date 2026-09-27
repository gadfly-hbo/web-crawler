/** API 客户端：同源 fetch（开发模式由 vite 代理到 4180）。 */
import type { TaskParams } from '../../shared/task-params';
import type { TaskRecord } from '../../shared/task';

export interface StockEntry {
  code: string;
  name: string;
  pinyin: string;
  orgId: string;
  category: string;
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export const api = {
  async tasks(): Promise<TaskRecord[]> {
    return json<{ tasks: TaskRecord[] }>(await fetch('/api/tasks')).then((r) => r.tasks);
  },
  async task(id: string): Promise<TaskRecord> {
    const res = await fetch(`/api/task/${id}`);
    if (!res.ok) throw new Error('任务不存在或已被清理');
    return json<TaskRecord>(res);
  },
  async createTask(params: TaskParams, dryRun: boolean): Promise<{ task?: TaskRecord; errors?: string[] }> {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params, dryRun }),
    });
    if (res.status === 400) return { errors: (await json<{ errors: string[] }>(res)).errors };
    if (!res.ok) return { errors: [`创建失败（HTTP ${res.status}）`] };
    return { task: await json<TaskRecord>(res) };
  },
  async cancelTask(id: string): Promise<void> {
    await fetch(`/api/task/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
  },
  async files(id: string): Promise<Array<{ path: string; size: number; mtime: number }>> {
    return json<{ files: Array<{ path: string; size: number; mtime: number }> }>(
      await fetch(`/api/task/${encodeURIComponent(id)}/files`),
    ).then((r) => r.files);
  },
  fileUrl(id: string, rel: string): string {
    return `/api/task/${encodeURIComponent(id)}/files/${encodeURIComponent(rel)}`;
  },
  archiveUrl(id: string): string {
    return `/api/task/${encodeURIComponent(id)}/archive`;
  },
  async reveal(id: string): Promise<void> {
    await fetch(`/api/task/${encodeURIComponent(id)}/reveal`, { method: 'POST' });
  },
  async industries(): Promise<string[]> {
    return json<{ industries: string[] }>(await fetch('/api/meta/industries')).then((r) => r.industries);
  },
  async searchStocks(q: string): Promise<{ stocks: StockEntry[]; error?: string }> {
    const res = await fetch(`/api/meta/stocks?q=${encodeURIComponent(q)}`);
    if (res.status === 503) return { stocks: [], error: (await json<{ error: string }>(res)).error };
    return { stocks: (await json<{ stocks: StockEntry[] }>(res)).stocks };
  },
};
