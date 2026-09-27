/** HTTP API：Hono 应用工厂（依赖注入 Queue 与 StockDirectory，测试用 app.request 直驱）。 */
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { spawn } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

import { listIndustries } from '../../../crawlers/cninfo-reports/src/industries.js';
import { DEFAULT_SLEEP_MS, validateTaskParams, type ReportType, type TaskParams } from '../shared/task-params.js';
import type { TaskRecord } from '../shared/task.js';
import type { TaskQueue } from './queue.js';
import type { StockDirectory } from './stocks.js';

export interface AppDeps {
  queue: TaskQueue;
  stocks: StockDirectory;
  /** 在系统文件管理器中显示目录（默认 macOS open）；测试注入替身。 */
  reveal?: (dir: string) => void;
}

interface FileEntry {
  path: string;
  size: number;
  mtime: number;
}

/** 递归列出目录内容（相对路径），目录不存在时返回空清单。 */
async function walkFiles(root: string): Promise<FileEntry[]> {
  const out: FileEntry[] = [];
  async function rec(dir: string, prefix: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await rec(full, `${prefix}${e.name}/`);
      else if (e.isFile()) {
        const st = await stat(full);
        out.push({ path: `${prefix}${e.name}`, size: st.size, mtime: st.mtimeMs });
      }
    }
  }
  await rec(root, '');
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** 解析任务目录内的相对路径，拒绝任何逃逸（../、编码绕过等）。 */
function resolveInside(root: string, rel: string): string | null {
  if (!rel || rel.includes('\0')) return null;
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

/** 把不信任的 JSON 输入规整为 TaskParams（未知字段丢弃，类型不对的给空默认）。 */
function normalizeParams(raw: unknown): TaskParams {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string').map((s) => s.trim()).filter(Boolean) : [];
  const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
  return {
    companies: strArr(obj.companies),
    industries: strArr(obj.industries),
    year: num(obj.year),
    from: typeof obj.from === 'string' ? obj.from : undefined,
    to: typeof obj.to === 'string' ? obj.to : undefined,
    types: strArr(obj.types) as ReportType[],
    limit: num(obj.limit),
    sleepMs: num(obj.sleepMs) ?? DEFAULT_SLEEP_MS,
  };
}

export function buildApp(deps: AppDeps) {
  const app = new Hono();

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.get('/api/meta/industries', (c) => c.json({ industries: [...listIndustries()] }));

  app.get('/api/meta/stocks', async (c) => {
    try {
      const stocks = await deps.stocks.search(c.req.query('q') ?? '');
      return c.json({ stocks });
    } catch {
      return c.json(
        { error: '证券清单暂时不可用（巨潮资讯网无响应），请稍后重试；仍可直接输入 6 位公司代码创建任务' },
        503,
      );
    }
  });

  app.post('/api/tasks', async (c) => {
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ errors: ['请求体不是合法 JSON'] }, 400);
    }
    const params = normalizeParams(body.params);
    const errors = validateTaskParams(params, listIndustries());
    if (errors.length > 0) return c.json({ errors }, 400);
    const task = await deps.queue.create(params, Boolean(body.dryRun));
    return c.json(task, 201);
  });

  app.get('/api/tasks', (c) => c.json({ tasks: deps.queue.list() }));

  // 列表级事件流：全量快照 + 后续 update
  // 注意：不能叫 /api/tasks/events——静态段与 /api/tasks/:id 同位冲突会让 RegExpRouter 抛 UnsupportedPathError
  app.get('/api/events', (c) => {
    const queue = deps.queue;
    return streamSSE(c, async (stream) => {
      const onUpdate = (t: TaskRecord) => {
        void stream.writeSSE({ event: 'task', data: JSON.stringify(t) }).catch(() => {});
      };
      queue.events.on('update', onUpdate);
      try {
        for (const t of queue.list()) {
          await stream.writeSSE({ event: 'task', data: JSON.stringify(t) });
        }
        await new Promise<void>((resolve) => {
          c.req.raw.signal.addEventListener('abort', () => resolve());
        });
      } finally {
        queue.events.off('update', onUpdate);
      }
    });
  });

  app.get('/api/task/:id', (c) => {
    const task = deps.queue.get(c.req.param('id'));
    if (!task) return c.json({ error: '任务不存在或已被清理' }, 404);
    return c.json(task);
  });

  app.post('/api/task/:id/cancel', async (c) => {
    const task = deps.queue.get(c.req.param('id'));
    if (!task) return c.json({ error: '任务不存在或已被清理' }, 404);
    if (task.status !== 'queued' && task.status !== 'running') {
      return c.json({ error: '任务已结束，不能取消' }, 409);
    }
    return c.json((await deps.queue.cancel(task.id)) ?? task);
  });

  // 文件清单：磁盘实时扫描（磁盘是事实源）
  app.get('/api/task/:id/files', async (c) => {
    const task = deps.queue.get(c.req.param('id'));
    if (!task) return c.json({ error: '任务不存在或已被清理' }, 404);
    return c.json({ files: await walkFiles(task.outDir) });
  });

  // 单文件下载（通配路由承载含 / 的相对路径）
  app.get('/api/task/:id/files/*', async (c) => {
    const task = deps.queue.get(c.req.param('id'));
    if (!task) return c.json({ error: '任务不存在或已被清理' }, 404);
    const prefix = `/api/task/${task.id}/files/`;
    const rel = decodeURIComponent(c.req.path.slice(prefix.length));
    const abs = resolveInside(task.outDir, rel);
    if (!abs) return c.json({ error: '非法的文件路径' }, 400);
    const st = await stat(abs).catch(() => null);
    if (!st?.isFile()) return c.json({ error: '文件不存在' }, 404);
    const buf = await readFile(abs);
    return c.body(new Uint8Array(buf), 200, {
      'Content-Type': abs.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(abs))}`,
    });
  });

  // zip 打包下载：spawn 系统 zip，stdout 流式直出
  app.get('/api/task/:id/archive', async (c) => {
    const task = deps.queue.get(c.req.param('id'));
    if (!task) return c.json({ error: '任务不存在或已被清理' }, 404);
    const st = await stat(task.outDir).catch(() => null);
    if (!st?.isDirectory()) return c.json({ error: '该任务没有产出文件' }, 404);
    const child = spawn('zip', ['-r', '-q', '-', '.'], { cwd: task.outDir });
    const webStream = Readable.toWeb(child.stdout) as ReadableStream;
    return c.body(webStream, 200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${task.id}.zip"`,
    });
  });

  // 在 Finder 中显示输出目录
  app.post('/api/task/:id/reveal', (c) => {
    const task = deps.queue.get(c.req.param('id'));
    if (!task) return c.json({ error: '任务不存在或已被清理' }, 404);
    (deps.reveal ?? ((dir: string) => void spawn('open', [dir])))(task.outDir);
    return c.json({ ok: true });
  });

  // 单任务事件流：task 快照 → 日志回放（带序号）→ 实时 log/task 事件
  app.get('/api/task/:id/events', (c) => {
    const task = deps.queue.get(c.req.param('id'));
    if (!task) return c.json({ error: '任务不存在或已被清理' }, 404);
    const queue = deps.queue;
    return streamSSE(c, async (stream) => {
      let replaying = true;
      const pendingLogs: Array<{ seq: number; line: string }> = [];
      let pendingTask: TaskRecord | null = null;
      const onLog = (taskId: string, line: string, seq: number) => {
        if (taskId !== task.id) return;
        if (replaying) pendingLogs.push({ seq, line });
        else void stream.writeSSE({ event: 'log', data: JSON.stringify({ seq, line }) }).catch(() => {});
      };
      const onUpdate = (t: TaskRecord) => {
        if (t.id !== task.id) return;
        if (replaying) pendingTask = t;
        else void stream.writeSSE({ event: 'task', data: JSON.stringify(t) }).catch(() => {});
      };
      queue.events.on('log', onLog);
      queue.events.on('update', onUpdate);
      const cleanup = () => {
        queue.events.off('log', onLog);
        queue.events.off('update', onUpdate);
      };
      try {
        await stream.writeSSE({ event: 'task', data: JSON.stringify(queue.get(task.id) ?? task) });
        let replayed = 0;
        try {
          const content = await readFile(task.logFile, 'utf8');
          for (const line of content.split('\n')) {
            if (!line.trim()) continue;
            replayed++;
            await stream.writeSSE({ event: 'log', data: JSON.stringify({ seq: replayed, line }) });
          }
        } catch {
          // 尚无日志文件（任务未产生输出）
        }
        replaying = false;
        for (const l of pendingLogs) {
          if (l.seq > replayed) await stream.writeSSE({ event: 'log', data: JSON.stringify(l) });
        }
        if (pendingTask) await stream.writeSSE({ event: 'task', data: JSON.stringify(pendingTask) });
        await new Promise<void>((resolve) => {
          c.req.raw.signal.addEventListener('abort', () => resolve());
        });
      } finally {
        cleanup();
      }
    });
  });

  return app;
}
