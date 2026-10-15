import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BudgetExceededError,
  BudgetGate,
  computeFileSha256,
  createAndSaveDeliveryManifest,
  EvidenceIndexStore,
  locateSnippet,
  SnapshotStorage,
  verifyDeliveryPackage,
} from '../src/index.js';

test('data-governance: evidence 定位与 SQLite 索引存储', () => {
  const text = '第一行\n目标文本在此处\n第三行';
  const loc = locateSnippet(text, '目标文本');
  assert.ok(loc);
  assert.equal(loc.lineStart, 2);
  assert.equal(loc.lineEnd, 2);

  const store = new EvidenceIndexStore(':memory:');
  const ev = store.insert({
    taskId: 'task_demo',
    recordId: 'rec_1',
    snapshotId: 'snap_1',
    field: 'title',
    value: '测试标题',
    sourceText: '目标文本',
    lineStart: 2,
    lineEnd: 2,
    charOffsetStart: 4,
    charOffsetEnd: 8,
    confidence: 0.95,
    extractorType: 'parser',
  });

  assert.ok(ev.id);
  const list = store.query({ taskId: 'task_demo', recordId: 'rec_1' });
  assert.equal(list.length, 1);
  assert.equal(list[0].field, 'title');
  store.close();
});

test('data-governance: budget 门禁拦截与在途熔断', () => {
  const gate = new BudgetGate({ maxCalls: 2, maxTokens: 1000 });
  gate.checkAndReserve(200);
  gate.recordUsage({ tokens: 300 });

  gate.checkAndReserve(200);
  gate.recordUsage({ tokens: 300 });

  assert.throws(
    () => gate.checkAndReserve(100),
    (err: any) => err instanceof BudgetExceededError && err.reason === 'CALLS_EXCEEDED'
  );
});

test('data-governance: manifest 生成与 SHA-256 防篡改校验', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'dg-test-'));

  try {
    const dataFile = path.join(tmp, 'data.jsonl');
    await writeFile(dataFile, '{"hello": "world"}\n', 'utf8');

    const manifest = await createAndSaveDeliveryManifest({
      dir: tmp,
      datasetId: 'test_ds',
      sourceType: 'test',
      generatorName: 'test-runner',
      recordsCount: 1,
      validCount: 1,
      filesToSign: ['data.jsonl'],
      evidenceCount: 1,
    });

    assert.ok(manifest.checksums['data.jsonl']);
    const check1 = await verifyDeliveryPackage(tmp);
    assert.equal(check1.valid, true);

    // 篡改
    await writeFile(dataFile, '{"hello": "tampered"}\n', 'utf8');
    const check2 = await verifyDeliveryPackage(tmp);
    assert.equal(check2.valid, false);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('data-governance: storage 原子快照保存', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'dg-snap-'));

  try {
    const storage = new SnapshotStorage(tmp);
    const res = await storage.saveSnapshot({
      targetUrl: 'http://example.com',
      provider: 'mock',
      statusCode: 200,
      markdown: '# Title',
      requestedAt: new Date().toISOString(),
    }, 's1');

    assert.ok(res.metadata.content_hash);
    assert.equal(res.metadata.files.markdown, 'content.md');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
