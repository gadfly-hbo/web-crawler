/** RSS 端到端：TaskQueue + makeCrawlerRunner 真实 spawn rss-collector CLI（KA1 裁决的证明用例）。 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { TaskQueue } from '../server/queue.js';
import { makeCrawlerRunner } from '../server/runner.js';
import { parseRssEvent } from 'rss-collector/events';
import type { RssTaskParams } from '../shared/task-params.js';

const pkgDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(pkgDir, '..', '..');

async function waitForTerminal(queue: TaskQueue, id: string, timeoutMs = 60000): Promise<NonNullable<ReturnType<TaskQueue['get']>>> {
  const started = Date.now();
  for (;;) {
    const task = queue.get(id);
    if (!task) throw new Error('任务消失');
    if (task.status !== 'queued' && task.status !== 'running') return task;
    if (Date.now() - started > timeoutMs) throw new Error(`等待终态超时，当前 ${task.status}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

test('RSS e2e: 运行中取消（A13）——挂起 Feed 被取消后终态 canceled、无 done 事件、子进程终止', async (t) => {
  // 挂起路由：建立连接后不响应，直到客户端断开
  const server = http.createServer((req, res) => {
    if (req.url === '/hang') {
      req.socket.setTimeout(0);
      // 永不写入：模拟无响应 Feed
    } else {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;

  process.env.RSS_ALLOW_PRIVATE_ORIGIN = '1';
  t.after(() => {
    delete process.env.RSS_ALLOW_PRIVATE_ORIGIN;
  });

  const dataRoot = await mkdtemp(path.join(tmpdir(), 'wb-rss-cancel-'));
  const queue = new TaskQueue({ runner: makeCrawlerRunner({ repoRoot }), dataRoot });
  await queue.init();

  try {
    const task = await queue.create(
      {
        sourceType: 'rss',
        name: '取消测试',
        urls: [`http://127.0.0.1:${port}/hang`],
        deadlineMs: 120000, // 足够长，确保是用户取消而非 deadline 先到
      },
      false,
    );

    // 等到任务真正 running 且 CLI 已输出 start（日志文件惰性创建，首行落盘才存在）
    const started = Date.now();
    const logPath = path.join(dataRoot, 'workbench', 'logs', `${task.id}.ndjson`);
    while (true) {
      const stat = await fs.stat(logPath).catch(() => null);
      if (stat && stat.size > 0) break;
      if (Date.now() - started > 30000) throw new Error('任务未进入 running 或 CLI 未输出 start');
      await new Promise((r) => setTimeout(r, 50));
    }

    const canceled = await queue.cancel(task.id);
    assert.ok(canceled);
    assert.equal(canceled.status, 'canceled', '取消后终态如实为 canceled');
    assert.ok(canceled.finishedAt);

    // 等待日志落盘与子进程退出，再断言日志中没有 done/error 收尾事件
    await new Promise((r) => setTimeout(r, 1500));
    await queue.close();
    const log = await fs.readFile(path.join(dataRoot, 'workbench', 'logs', `${task.id}.ndjson`), 'utf8');
    const events = log
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => parseRssEvent(l))
      .filter((e) => e !== null);
    const types = events.map((e) => e!.type);
    assert.ok(types.includes('start'), '取消前应有 start');
    assert.ok(!types.includes('done'), '被取消的任务不得再有 done 事件（无双终态）');
    const after = queue.get(task.id);
    assert.equal(after?.status, 'canceled', '终态保持 canceled 不被后续事件改写');
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('RSS e2e: 双 Feed 一成一败 → 终态 partial、counts/failures 如实、快照与 manifest 落盘', async (t) => {
  const feedXml = await fs.readFile(
    path.join(repoRoot, 'crawlers', 'rss-collector', 'test', 'fixtures', 'normal-rss.xml'),
    'utf8'
  );
  const server = http.createServer((req, res) => {
    if (req.url === '/feed.xml') {
      res.writeHead(200, { 'content-type': 'application/rss+xml' });
      res.end(feedXml);
    } else {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;

  // G3：豁免经 env 继承进子进程（runner spawn 合并 process.env）
  process.env.RSS_ALLOW_PRIVATE_ORIGIN = '1';
  t.after(() => {
    delete process.env.RSS_ALLOW_PRIVATE_ORIGIN;
  });

  const dataRoot = await mkdtemp(path.join(tmpdir(), 'wb-rss-e2e-'));
  const queue = new TaskQueue({ runner: makeCrawlerRunner({ repoRoot }), dataRoot });
  await queue.init();

  try {
    const params: RssTaskParams = {
      sourceType: 'rss',
      name: '公开资讯 e2e',
      urls: [`http://127.0.0.1:${port}/feed.xml`, `http://127.0.0.1:${port}/missing.xml`],
    };
    const task = await queue.create(params, false);
    assert.equal(task.title, 'RSS 采集 · 公开资讯 e2e');

    const finalTask = await waitForTerminal(queue, task.id);

    // KA1 recheck：部分失败 → partial（有产出），counts/failures 如实
    assert.equal(finalTask.status, 'partial', `终态应为 partial，实际 ${finalTask.status}`);
    assert.equal(finalTask.counts.downloaded, 1);
    assert.equal(finalTask.counts.failed, 1);
    assert.equal(finalTask.counts.skipped, 0);
    assert.equal(finalTask.failures.length, 1);
    assert.match(finalTask.failures[0].reason ?? '', /HTTP 404/);

    // 日志含完整事件流（start → company×2 → file → done，NDJSON 可解析）
    const log = await fs.readFile(path.join(dataRoot, 'workbench', 'logs', `${task.id}.ndjson`), 'utf8');
    const events = log
      .trim()
      .split('\n')
      .map((l) => parseRssEvent(l))
      .filter((e) => e !== null);
    const types = events.map((e) => e!.type);
    assert.ok(types.includes('start'));
    assert.equal(types.filter((x) => x === 'company').length, 2);
    assert.equal(types.filter((x) => x === 'file').length, 2);
    assert.equal(types[types.length - 1], 'done');
    const done = events.find((e) => e?.type === 'done');
    assert.ok(done && done.type === 'done');
    assert.equal(done.summary.downloaded, 1);
    assert.equal(done.summary.failed, 1);
    assert.equal(done.summary.matched, 3);

    // 产物：快照 XML + manifest 在任务隔离目录
    assert.ok(finalTask.outDir.includes('rss-collector'));
    const manifestRaw = await fs.readFile(path.join(finalTask.outDir, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(manifestRaw);
    assert.equal(manifest.sourceSummary.sourceType, 'rss');
    const snapshotsDir = path.join(finalTask.outDir, 'snapshots');
    const snapIds = (await fs.readdir(snapshotsDir)).filter((d) => !d.endsWith('.tmp'));
    assert.equal(snapIds.length, 1);
    const xml = await fs.readFile(path.join(snapshotsDir, snapIds[0], 'content.xml'), 'utf8');
    assert.equal(xml, feedXml);
  } finally {
    await queue.close();
    await rm(dataRoot, { recursive: true, force: true });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
