/** API 层测试：Hono app.fetch 直驱（不起监听），队列用真 TaskQueue + fake runner，证券清单用假巨潮服务器。 */
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { buildApp } from '../server/app.js';
import { TaskQueue, type Runner } from '../server/queue.js';
import { StockDirectory } from '../server/stocks.js';
import type { TaskParams } from '../shared/task-params.js';

const PARAMS: TaskParams = {
  companies: ['平安银行'],
  industries: [],
  year: 2024,
  types: ['annual'],
  sleepMs: 1000,
};

/** 测试内宽松取 JSON（Hono app.fetch 的 Response.json() 返回 unknown）。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const j = async (res: Response): Promise<any> => res.json();

const okRunner: Runner = (_task, emit) => {
  emit(JSON.stringify({ type: 'preview', companies: 1, reports: 1 }));
  emit(JSON.stringify({ type: 'done', summary: { companies: 1, matched: 1, downloaded: 0, skipped: 0, bytes: 0, failed: 0, outDir: '/x' } }));
  return { done: Promise.resolve(), cancel: () => {} };
};

const STOCK_LIST = {
  stockList: [
    { code: '000001', zwjc: '平安银行', pinyin: 'PAYH', orgId: 'gssz0000001', category: 'A股' },
    { code: '600000', zwjc: '浦发银行', pinyin: 'PFYH', orgId: 'gssh0600000', category: 'A股' },
    { code: '900901', zwjc: '示例B股', pinyin: 'SLBG', orgId: 'gxxx', category: 'B股' },
  ],
};

async function withApp(
  fn: (app: ReturnType<typeof buildApp>, ctx: { stockOrigin: string }) => Promise<void>,
  opts: { stockServer?: 'ok' | 'down' } = {},
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'wb-api-'));
  let server: Server | null = null;
  let stockOrigin = 'http://127.0.0.1:1';
  try {
    if (opts.stockServer !== 'down') {
      server = createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(STOCK_LIST));
      });
      await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
      stockOrigin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    }
    const queue = new TaskQueue({ runner: okRunner, dataRoot: dir });
    await queue.init();
    const stocks = new StockDirectory({ origin: stockOrigin, ttlMs: 60_000 });
    const app = buildApp({ queue, stocks });
    try {
      await fn(app, { stockOrigin });
    } finally {
      await queue.close();
    }
  } finally {
    server?.close();
    await rm(dir, { recursive: true, force: true });
  }
}

test('POST /api/tasks：非法参数返回 400 与中文错误清单', async () => {
  await withApp(async (app) => {
    const res = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params: { ...PARAMS, companies: [], year: undefined }, dryRun: false }),
    });
    assert.equal(res.status, 400);
    const body = await j(res);
    assert.ok(body.errors.some((e: string) => e.includes('必须至少选择一个公司或一个行业')));
  });
});

test('POST /api/tasks：合法参数创建任务并入队，GET 列表/详情可见', async () => {
  await withApp(async (app) => {
    const created = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params: PARAMS, dryRun: true }),
    });
    assert.equal(created.status, 201);
    const task = await j(created);
    assert.equal(task.dryRun, true);
    assert.equal(task.title, '平安银行 · 2024 · 年报 · 预览');

    const list = await j(await app.request('/api/tasks'));
    assert.equal(list.tasks.length, 1);
    assert.equal(list.tasks[0].id, task.id);

    const detail = await app.request(`/api/task/${task.id}`);
    assert.equal(detail.status, 200);
    const missing = await app.request('/api/task/nope');
    assert.equal(missing.status, 404);
  });
});

test('GET /api/meta/industries 返回 19 个证监会门类', async () => {
  await withApp(async (app) => {
    const body = await j(await app.request('/api/meta/industries'));
    assert.equal(body.industries.length, 19);
    assert.ok(body.industries.includes('金融业'));
  });
});

test('GET /api/meta/stocks 支持名称/代码/拼音模糊搜索，A 股优先', async () => {
  await withApp(async (app) => {
    const byName = await j(await app.request('/api/meta/stocks?q=平安'));
    assert.deepEqual(byName.stocks.map((s: { code: string }) => s.code), ['000001']);
    const byCode = await j(await app.request('/api/meta/stocks?q=600'));
    assert.deepEqual(byCode.stocks.map((s: { code: string }) => s.code), ['600000']);
    const byPinyin = await j(await app.request('/api/meta/stocks?q=pfyh'));
    assert.deepEqual(byPinyin.stocks.map((s: { code: string }) => s.code), ['600000']);
  });
});

test('GET /api/meta/stocks 源站不可达且无缓存时返回 503 中文提示', async () => {
  await withApp(
    async (app) => {
      const res = await app.request('/api/meta/stocks?q=平安');
      assert.equal(res.status, 503);
      const body = await j(res);
      assert.match(body.error, /证券清单/);
    },
    { stockServer: 'down' },
  );
});
