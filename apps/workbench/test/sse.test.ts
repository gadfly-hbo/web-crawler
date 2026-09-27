/** 切片 3 API 测试：取消语义 + SSE 事件流（回放 + 实时）。 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { buildApp } from '../server/app.js';
import { TaskQueue, type Runner, type TaskRecord } from '../server/queue.js';
import { StockDirectory } from '../server/stocks.js';
import type { TaskParams } from '../shared/task-params.js';

const PARAMS: TaskParams = { companies: ['平安银行'], industries: [], year: 2024, types: ['annual'], sleepMs: 1000 };

/** 手动 runner：测试握有 emit/结束开关。 */
function manualRunner() {
  const controls: Array<{ task: TaskRecord; emit: (l: string) => void; finish: () => void; cancel: () => void }> = [];
  const runner: Runner = (task, emit) => {
    let finish!: () => void;
    const done = new Promise<void>((r) => (finish = r));
    const cancel = () => finish();
    controls.push({ task, emit, finish, cancel });
    return { done, cancel };
  };
  return { runner, controls };
}

async function withApp(
  runner: Runner,
  fn: (app: ReturnType<typeof buildApp>, q: TaskQueue) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'wb-sse-'));
  const q = new TaskQueue({ runner, dataRoot: dir });
  try {
    await q.init();
    const app = buildApp({ queue: q, stocks: new StockDirectory({ origin: 'http://127.0.0.1:1' }) });
    await fn(app, q);
  } finally {
    await q.close();
    await rm(dir, { recursive: true, force: true });
  }
}

/** 读取 SSE 响应流，按 event/data 解析，直到满足条数或超时。 */
async function readSse(res: Response, want: number, timeoutMs = 3000): Promise<Array<{ event: string; data: string }>> {
  const out: Array<{ event: string; data: string }> = [];
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const deadline = Date.now() + timeoutMs;
  while (out.length < want && Date.now() < deadline) {
    const chunk = await Promise.race([
      reader.read(),
      new Promise<null>((r) => setTimeout(() => r(null), Math.max(50, deadline - Date.now()))),
    ]);
    if (!chunk || chunk.done) break;
    buf += dec.decode(chunk.value, { stream: true });
    const blocks = buf.split('\n\n');
    buf = blocks.pop() ?? '';
    for (const b of blocks) {
      const event = b.match(/^event: (.*)$/m)?.[1];
      const data = b.match(/^data: (.*)$/m)?.[1];
      if (event && data) out.push({ event, data });
    }
  }
  await reader.cancel().catch(() => {});
  return out;
}

test('POST /api/task/:id/cancel：运行中任务被取消；已结束任务返回 409', async () => {
  const { runner, controls } = manualRunner();
  await withApp(runner, async (app, q) => {
    const t = await q.create(PARAMS, false);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(q.get(t.id)?.status, 'running');

    const res = await app.request(`/api/task/${t.id}/cancel`, { method: 'POST' });
    assert.equal(res.status, 200);
    assert.equal(q.get(t.id)?.status, 'canceled');
    assert.equal(controls.length, 1);

    const again = await app.request(`/api/task/${t.id}/cancel`, { method: 'POST' });
    assert.equal(again.status, 409);
    const missing = await app.request('/api/task/nope/cancel', { method: 'POST' });
    assert.equal(missing.status, 404);
  });
});

test('GET /api/task/:id/events：先回放快照与历史日志，后续实时事件带序号', async () => {
  const { runner, controls } = manualRunner();
  await withApp(runner, async (app, q) => {
    const t = await q.create(PARAMS, false);
    await new Promise((r) => setTimeout(r, 20));
    controls[0].emit(JSON.stringify({ type: 'start', totalCompanies: 3, dryRun: false }));
    await q.close(); // 确保日志落盘后再连接 SSE（回放源是日志文件）

    const res = await app.request(`/api/task/${t.id}/events`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/event-stream');

    // 连接后再产生一行实时日志
    setTimeout(() => {
      controls[0].emit(JSON.stringify({ type: 'company', index: 1, total: 3, code: '000001', name: '平安银行' }));
    }, 50);

    const events = await readSse(res, 3);
    const kinds = events.map((e) => e.event);
    assert.deepEqual(kinds, ['task', 'log', 'log']);
    const firstLog = JSON.parse(events[1].data);
    const secondLog = JSON.parse(events[2].data);
    assert.equal(firstLog.seq, 1);
    assert.match(firstLog.line, /"start"/);
    assert.equal(secondLog.seq, 2);
    assert.match(secondLog.line, /"company"/);
  });
});

test('GET /api/events：快照全量任务 + 后续状态更新实时推送', async () => {
  const { runner, controls } = manualRunner();
  await withApp(runner, async (app, q) => {
    const existing = await q.create(PARAMS, true);
    await new Promise((r) => setTimeout(r, 20));
    const res = await app.request('/api/events');
    assert.equal(res.status, 200);

    setTimeout(() => {
      controls[0].emit(JSON.stringify({ type: 'start', totalCompanies: 1, dryRun: true }));
    }, 50);

    const events = await readSse(res, 2);
    assert.equal(events[0].event, 'task');
    assert.equal(JSON.parse(events[0].data).id, existing.id);
    assert.equal(events[1].event, 'task');
    assert.equal(JSON.parse(events[1].data).totalCompanies, 1);
  });
});
