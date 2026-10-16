/**
 * WC-AR-06 A18：mock 商品样板 workbench 级采集链路冒烟。
 * F6 已修复（快照统一落 outDir/snapshots/）：本用例同时断言采集链路（事件流/快照/manifest）
 * 与分析链路（analysis_summary totalRecords=9 + 三品牌汇总）。
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

/** firecrawl CLI 的 done 事件先于 analyze pipeline 完成发出（既有协议语义）——终态后需再等交付产物落盘 */
async function waitForFile(filePath: string, timeoutMs = 30000): Promise<void> {
  const started = Date.now();
  for (;;) {
    if (await fs.stat(filePath).then(() => true).catch(() => false)) return;
    if (Date.now() - started > timeoutMs) throw new Error(`等待产物超时: ${filePath}`);
    await new Promise((r) => setTimeout(r, 50));
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
    // done 事件先于 pipeline 产物——等 manifest 落盘再断言交付物
    await waitForFile(path.join(finalTask.outDir, 'manifest.json'));
    await waitForFile(path.join(finalTask.outDir, 'analysis_summary.json'));

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

    // 快照落盘（F6 修复后契约：outDir/snapshots/<snap_*>/，与消费端一致）
    const outEntries = await fs.readdir(finalTask.outDir);
    assert.ok(!outEntries.some((e) => e.startsWith('snap_')), `顶层不得再出现快照目录：${outEntries.join(',')}`);
    const snapshotsDir = path.join(finalTask.outDir, 'snapshots');
    const snapDirs = (await fs.readdir(snapshotsDir)).filter((e) => e.startsWith('snap_'));
    assert.equal(snapDirs.length, 9, `snapshots/ 下应恰 9 个快照，实得 ${snapDirs.length}`);
    const sampleMeta = JSON.parse(
      await fs.readFile(path.join(snapshotsDir, snapDirs[0], 'metadata.json'), 'utf8'),
    );
    assert.ok(sampleMeta.content_hash, '快照 metadata 含哈希');

    // manifest 落盘
    const manifest = JSON.parse(await fs.readFile(path.join(finalTask.outDir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.manifestVersion, '1.0.0');

    // A18 补强：F6 修复后分析链路真实产出（红队 V2 探针前提成立）
    const analysis = JSON.parse(
      await fs.readFile(path.join(finalTask.outDir, 'analysis_summary.json'), 'utf8'),
    );
    assert.equal(analysis.totalRecords, 9, `mock 样板应产出 9 条记录，实得 ${analysis.totalRecords}`);
    const brands = (analysis.brandSummaries ?? []).map((b: { brand: string }) => b.brand);
    assert.deepEqual(brands.sort(), ['Brand A', 'Brand B', 'Brand C'], `三品牌汇总应齐，实得 ${brands.join(',')}`);
  } finally {
    await queue.close();
    await rm(dataRoot, { recursive: true, force: true });
  }
});
