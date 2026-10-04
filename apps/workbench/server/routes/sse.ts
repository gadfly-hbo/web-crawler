/** SSE 实时事件流与日志回放路由。 */
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { readFile } from 'node:fs/promises';

import type { TaskRecord } from '../../shared/task.js';
import type { AppDeps } from '../types.js';

export function sseRoutes(deps: AppDeps): Hono {
  const app = new Hono();

  // 列表级事件流：全量快照 + 后续 update
  // 注意：不能叫 /api/tasks/events——静态段与 /api/tasks/:id 同位冲突会让 RegExpRouter 抛 UnsupportedPathError
  app.get('/events', (c) => {
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

  // 单任务事件流：task 快照 → 日志回放（带序号）→ 实时 log/task 事件
  app.get('/task/:id/events', (c) => {
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
