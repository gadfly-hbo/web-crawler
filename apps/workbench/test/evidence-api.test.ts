import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { buildApp } from '../server/app.js';
import { TaskQueue, type Runner } from '../server/queue.js';
import { StockDirectory } from '../server/stocks.js';
import type { WebScraperParams } from '../shared/task-params.js';

const dummyRunner: Runner = (_task, emit) => {
  emit(JSON.stringify({ type: 'start' }));
  emit(JSON.stringify({ type: 'done', summary: { succeeded: 1, failed: 0 } }));
  return { done: Promise.resolve(), cancel: () => {} };
};

test('Evidence API: 完整打通证据检索、快照文本定位与人工修订留痕', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'wb-evidence-'));
  const queue = new TaskQueue({ runner: dummyRunner, dataRoot: dataDir });
  await queue.init();
  const stocks = new StockDirectory();
  const app = buildApp({ queue, stocks });

  try {
    // 1. 创建 web-scraper 任务
    const params: WebScraperParams = {
      sourceType: 'web-scraper',
      name: '商品价格测试任务',
      urls: ['https://brand-a.example/p1'],
      mock: true,
      analyze: true,
      baselineBrand: 'Brand A',
    };
    const task = await queue.create(params, false);
    assert.ok(task.id);

    // 2. 模拟写入 evidence.sqlite
    await mkdir(task.outDir, { recursive: true });
    const sqlitePath = path.join(task.outDir, 'evidence.sqlite');
    const db = new DatabaseSync(sqlitePath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS field_evidences (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        record_id TEXT NOT NULL,
        snapshot_id TEXT NOT NULL,
        field TEXT NOT NULL,
        value_json TEXT,
        source_text TEXT NOT NULL,
        selector_or_pattern TEXT,
        line_start INTEGER NOT NULL,
        line_end INTEGER NOT NULL,
        char_offset_start INTEGER NOT NULL,
        char_offset_end INTEGER NOT NULL,
        confidence REAL NOT NULL,
        extractor_type TEXT NOT NULL,
        extracted_at TEXT NOT NULL
      );
    `);
    const stmt = db.prepare(`
      INSERT INTO field_evidences VALUES (
        'ev_1', ?, 'rec_1', 'snap_1', 'price', '299', '¥299.00', '.price', 4, 4, 50, 57, 0.99, 'css', '2026-10-06T09:00:00Z'
      )
    `);
    stmt.run(task.id);
    db.close();

    // 3. 模拟写入快照内容
    const snapDir = path.join(task.outDir, 'snapshots', 'snap_1');
    await mkdir(snapDir, { recursive: true });
    const mdContent = '# 示例商品标题\n\nBrand: Brand A\n价格: ¥299.00\n详情说明';
    await writeFile(path.join(snapDir, 'content.md'), mdContent, 'utf8');

    // 4. 测试 GET /api/tasks/:id/evidence
    const evRes = await app.fetch(new Request(`http://localhost/api/tasks/${task.id}/evidence?recordId=rec_1&field=price`));
    assert.equal(evRes.status, 200);
    const evData = (await evRes.json()) as any;
    assert.equal(evData.evidences.length, 1);
    assert.equal(evData.evidences[0].field, 'price');
    assert.equal(evData.evidences[0].value, 299);
    assert.equal(evData.evidences[0].lineStart, 4);

    // 5. 测试 GET /api/tasks/:id/snapshot-content
    const snapRes = await app.fetch(new Request(`http://localhost/api/tasks/${task.id}/snapshot-content?snapshotId=snap_1`));
    assert.equal(snapRes.status, 200);
    const snapData = (await snapRes.json()) as any;
    assert.equal(snapData.snapshotId, 'snap_1');
    assert.equal(snapData.totalLines, 5);
    assert.equal(snapData.lines[3], '价格: ¥299.00');

    // 6. 测试 POST /api/tasks/:id/revisions (人工修订留痕)
    const revPostRes = await app.fetch(
      new Request(`http://localhost/api/tasks/${task.id}/revisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordId: 'rec_1',
          field: 'price',
          oldValue: 299,
          newValue: 289,
          reason: '官方限时折扣券减免 10 元',
          author: '测试审核员',
        }),
      })
    );
    assert.equal(revPostRes.status, 200);
    const revPostData = (await revPostRes.json()) as any;
    assert.equal(revPostData.ok, true);
    assert.equal(revPostData.revision.oldValue, 299);
    assert.equal(revPostData.revision.newValue, 289);
    assert.equal(revPostData.revision.author, '测试审核员');

    // 7. 测试 GET /api/tasks/:id/revisions
    const revGetRes = await app.fetch(new Request(`http://localhost/api/tasks/${task.id}/revisions`));
    assert.equal(revGetRes.status, 200);
    const revGetData = (await revGetRes.json()) as any;
    assert.equal(revGetData.revisions.length, 1);
    assert.equal(revGetData.revisions[0].reason, '官方限时折扣券减免 10 元');

    // 8. 写入 manifest.json 并测试 GET /api/tasks/:id/manifest
    const mockManifest = {
      manifestVersion: '1.0.0',
      datasetId: task.id,
      datasetVersion: 'v1.0-test',
      generatedAt: '2026-10-06T09:00:00Z',
      generator: { name: 'test', version: '0.1.0', description: 'test' },
      sourceSummary: { totalUrls: 1, succeeded: 1, failed: 0 },
      schema: { fields: [] },
      qualityMetrics: {
        totalRecords: 1,
        validRecords: 1,
        missingPriceRecords: 0,
        invalidPriceRecords: 0,
        evidenceCoverageRate: 1.0,
        dataCompletenessRate: 1.0,
      },
      files: { recordsData: 'records.jsonl', analysisCsv: 'analysis.csv', summaryJson: 'analysis_summary.json', snapshotsDir: 'snapshots/' },
      checksums: { 'records.jsonl': 'abc' },
    };
    await writeFile(path.join(task.outDir, 'manifest.json'), JSON.stringify(mockManifest), 'utf8');

    const manifestRes = await app.fetch(new Request(`http://localhost/api/tasks/${task.id}/manifest`));
    assert.equal(manifestRes.status, 200);
    const manifestData = (await manifestRes.json()) as any;
    assert.equal(manifestData.datasetId, task.id);
    assert.equal(manifestData.qualityMetrics.evidenceCoverageRate, 1.0);

    // 9. 测试 GET /api/tasks/:id/delivery-package
    const pkgRes = await app.fetch(new Request(`http://localhost/api/tasks/${task.id}/delivery-package`));
    assert.equal(pkgRes.status, 200);
    assert.equal(pkgRes.headers.get('Content-Type'), 'application/zip');
    assert.ok(pkgRes.headers.get('Content-Disposition')?.includes('delivery-'));
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('snapshot-content: RSS 的 content.xml 可回看（format=xml 与缺省回退），md/html 行为零变化', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'wb-evidence-xml-'));
  const queue = new TaskQueue({ runner: dummyRunner, dataRoot: dataDir });
  await queue.init();
  const stocks = new StockDirectory();
  const app = buildApp({ queue, stocks });

  try {
    const params: WebScraperParams = {
      sourceType: 'web-scraper',
      name: 'XML 回看测试',
      urls: ['https://brand-a.example/p1'],
      mock: true,
      analyze: true,
    };
    const task = await queue.create(params, false);

    // 仅含 content.xml 的快照（RSS 形态）
    const xmlDir = path.join(task.outDir, 'snapshots', 'snap_xml');
    await mkdir(xmlDir, { recursive: true });
    const xmlContent = '<?xml version="1.0"?>\n<rss version="2.0">\n  <channel>\n    <title>XML 源</title>\n  </channel>\n</rss>';
    await writeFile(path.join(xmlDir, 'content.xml'), xmlContent, 'utf8');

    // md/html 均不存在时缺省回退读 xml
    const fallbackRes = await app.fetch(new Request(`http://localhost/api/tasks/${task.id}/snapshot-content?snapshotId=snap_xml`));
    assert.equal(fallbackRes.status, 200);
    const fallback = (await fallbackRes.json()) as any;
    assert.equal(fallback.format, 'xml');
    assert.equal(fallback.content, xmlContent);
    assert.ok(Array.isArray(fallback.lines) && fallback.lines.length === 6);

    // format=xml 显式请求
    const explicitRes = await app.fetch(
      new Request(`http://localhost/api/tasks/${task.id}/snapshot-content?snapshotId=snap_xml&format=xml`)
    );
    assert.equal(explicitRes.status, 200);
    assert.equal(((await explicitRes.json()) as any).format, 'xml');

    // 既有 md 快照不受影响：format=xml 时仍读 xml（不存在则回退 md，不 404）
    const mdDir = path.join(task.outDir, 'snapshots', 'snap_md');
    await mkdir(mdDir, { recursive: true });
    await writeFile(path.join(mdDir, 'content.md'), '# MD 快照', 'utf8');
    const mdDefault = await app.fetch(new Request(`http://localhost/api/tasks/${task.id}/snapshot-content?snapshotId=snap_md`));
    assert.equal(mdDefault.status, 200);
    assert.equal(((await mdDefault.json()) as any).format, 'markdown');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
