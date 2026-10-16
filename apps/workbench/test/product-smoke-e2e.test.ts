/**
 * WC-AR-06 T5 / A18：mock 商品样板 workbench 级采集链路冒烟（PRD 决策 8，C1 降级断言层级）。
 * 注意：本用例只固化「采集链路不变」（事件流/快照/manifest）。**不覆盖分析内容**——
 * F6 布局地雷在案（engine 快照写 outDir 顶层而 --analyze 读 outDir/snapshots/，分析产物恒空，
 * 见 WC-AR-04 handoff 递延项）。TODO(F6)：修复批将快照断言改为 snapshots/ 子目录并补分析断言。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { TaskQueue } from '../server/queue.js';
import { makeCrawlerRunner } from '../server/runner.js';
import type { TaskRecord } from '../shared/task.js';
import type { WebScraperParams } from '../shared/task-params.js';

const pkgDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(pkgDir, '..', '..');

const SAMPLE_URLS = [
  'https://brand-a.example/shoes/101',
  'https://brand-a.example/shoes/102',
  'https://brand-a.example/shoes/103',
  'https://brand-b.example/shoes/201',
  'https://brand-b.example/shoes/202',
  'https://brand-b.example/shoes/203',
  'https://brand-c.example/shoes/301',
  'https://brand-c.example/shoes/302',
  'https://brand-c.example/shoes/303',
];

async function waitForTerminal(
  queue: TaskQueue,
  id: string,
  timeoutMs = 60000,
): Promise<NonNullable<ReturnType<TaskQueue['get']>>> {
  const started = Date.now();
  for (;;) {
    const task = queue.get(id);
    if (!task) throw new Error('任务消失');
    if (task.status !== 'queued' && task.status !== 'running') return task;
    if (Date.now() - started > timeoutMs) throw new Error(`等待终态超时，当前 ${task.status}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

test('A18 冒烟: mock 商品样板经 workbench 真实 spawn——采集链路不变（事件流/快照/manifest）', async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'wb-product-smoke-'));
  const queue = new TaskQueue({ runner: makeCrawlerRunner({ repoRoot }), dataRoot });
  await queue.init();

  try {
    const params: WebScraperParams = {
      sourceType: 'web-scraper',
      name: '品牌A/B/C商品标价中位数对比样板',
      urls: SAMPLE_URLS,
      mock: true,
      analyze: true,
      baselineBrand: 'Brand A',
    };
    const task = await queue.create(params, false);

    const finalTask = await waitForTerminal(queue, task.id);
    assert.equal(finalTask.status, 'succeeded', `mock 样板应成功，实际 ${finalTask.status}`);

    // 事件流完整（firecrawl 词汇表，JSON.parse 内联断言——G5 裁决，不新增包依赖）
    const log = await fs.readFile(path.join(dataRoot, 'workbench', 'logs', `${task.id}.ndjson`), 'utf8');
    const events = log
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { type: string; summary?: { failed?: number; total?: number } });
    const types = events.map((e) => e.type);
    assert.ok(types.includes('start'));
    assert.equal(types.filter((t) => t === 'scraping').length, 9);
    assert.equal(types.filter((t) => t === 'snapshot_saved').length, 9);
    assert.equal(types[types.length - 1], 'done');
    const done = events.find((e) => e.type === 'done');
    assert.equal(done?.summary?.failed, 0);

    // 快照落盘（TODO(F6)：现状布局为 outDir 顶层 snap_*，修复批应改为 snapshots/ 子目录断言）
    const outEntries = await fs.readdir(finalTask.outDir);
    const snapDirs = outEntries.filter((e) => e.startsWith('snap_'));
    assert.equal(snapDirs.length, 9, `快照应落 9 个（F6 现状：顶层 snap_*），实得 ${snapDirs.length}`);
    const sampleMeta = JSON.parse(
      await fs.readFile(path.join(finalTask.outDir, snapDirs[0], 'metadata.json'), 'utf8'),
    );
    assert.ok(sampleMeta.content_hash, '快照 metadata 含哈希');

    // manifest 落盘
    const manifest = JSON.parse(await fs.readFile(path.join(finalTask.outDir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.manifestVersion, '1.0.0');
  } finally {
    await queue.close();
    await rm(dataRoot, { recursive: true, force: true });
  }
});
