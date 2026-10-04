/** 采集任务生命周期与详情路由。 */
import { Hono } from 'hono';
import {
  DEFAULT_SLEEP_MS,
  listIndustries,
  validateTaskParams,
  type ReportType,
  type TaskParams,
} from 'cninfo-reports/domain';
import type { AppDeps } from '../types.js';

/** 把不信任的 JSON 输入规整为 TaskParams（未知字段丢弃，类型不对的给空默认）。 */
function normalizeParams(raw: unknown): TaskParams {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const strArr = (v: unknown): string[] =>
    Array.isArray(v)
      ? v
          .filter((s): s is string => typeof s === 'string')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
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

export function taskRoutes(deps: AppDeps): Hono {
  const app = new Hono();

  app.post('/tasks', async (c) => {
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

  app.get('/tasks', (c) => c.json({ tasks: deps.queue.list() }));

  app.get('/task/:id', (c) => {
    const task = deps.queue.get(c.req.param('id'));
    if (!task) return c.json({ error: '任务不存在或已被清理' }, 404);
    return c.json(task);
  });

  app.post('/task/:id/cancel', async (c) => {
    const task = deps.queue.get(c.req.param('id'));
    if (!task) return c.json({ error: '任务不存在或已被清理' }, 404);
    if (task.status !== 'queued' && task.status !== 'running') {
      return c.json({ error: '任务已结束，不能取消' }, 409);
    }
    return c.json((await deps.queue.cancel(task.id)) ?? task);
  });

  return app;
}
