import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ScraperEngine } from '../src/engine.js';
import { MockAcquisitionAdapter } from '../src/mock-adapter.js';
import { runProductAnalysisPipeline } from '../src/pipeline.js';
import { SnapshotStorage } from '../src/storage.js';

test('pipeline: 端到端 manifest 含 limitations（caveats 升格）与 operations（mock backend）', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-pipe-e2e-'));
  const snapshotsDir = path.join(tmpDir, 'snapshots');
  const outDir = path.join(tmpDir, 'out');

  const engine = new ScraperEngine({
    outDir: snapshotsDir,
    adapter: new MockAcquisitionAdapter([])
  });
  const summary = await engine.run(['https://example.com/good-1']);
  assert.equal(summary.succeeded, 1);

  const { manifest } = await runProductAnalysisPipeline(snapshotsDir, outDir, 'Brand A', 'task_pipe_e2e');

  assert.ok(Array.isArray(manifest.limitations));
  assert.ok(manifest.limitations!.length > 0);
  assert.equal(
    manifest.limitations![0],
    '网页标价不等于最终成交价，亦不包含优惠券、会员折扣或满减促销。'
  );
  assert.deepEqual(manifest.operations, [{ backend: 'mock_adapter' }]);

  const raw = JSON.parse(await fs.readFile(path.join(outDir, 'manifest.json'), 'utf8'));
  assert.deepEqual(raw.limitations, manifest.limitations);
  assert.deepEqual(raw.operations, [{ backend: 'mock_adapter' }]);

  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('pipeline: provider 为 unknown 的快照不产生 operations 键', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-pipe-unknown-'));
  const snapshotsDir = path.join(tmpDir, 'snapshots');
  const outDir = path.join(tmpDir, 'out');

  // saveSnapshot 不传 provider → 落盘 'unknown'（storage 兜底行为）
  const storage = new SnapshotStorage(snapshotsDir);
  await storage.saveSnapshot(
    { targetUrl: 'https://example.com/p1', markdown: '# 商品\n价格: ¥100' },
    'snap_unknown'
  );

  const { manifest } = await runProductAnalysisPipeline(snapshotsDir, outDir, 'Brand A', 'task_pipe_unknown');

  assert.equal(manifest.operations, undefined);
  const raw = JSON.parse(await fs.readFile(path.join(outDir, 'manifest.json'), 'utf8'));
  assert.equal('operations' in raw, false);

  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('pipeline: 无 provider 键的旧快照不产生 operations 键', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-pipe-legacy-'));
  const snapshotsDir = path.join(tmpDir, 'snapshots');
  const outDir = path.join(tmpDir, 'out');

  // 旧版快照形态：metadata.json 无 provider 键。
  // saveSnapshot 公开写入者恒写 provider（缺省 'unknown'），造不出该形态，故手写构造。
  const snapDir = path.join(snapshotsDir, 'snap_legacy');
  await fs.mkdir(snapDir, { recursive: true });
  await fs.writeFile(path.join(snapDir, 'content.md'), '# 商品\n价格: ¥100', 'utf8');
  await fs.writeFile(
    path.join(snapDir, 'metadata.json'),
    JSON.stringify({
      snapshot_id: 'snap_legacy',
      target_url: 'https://example.com/legacy',
      status_code: 200,
      requested_at: new Date().toISOString(),
      received_at: new Date().toISOString(),
      duration_ms: 0,
      content_hash: 'legacy',
      formats: ['markdown'],
      files: { markdown: 'content.md', metadata: 'metadata.json' }
    }),
    'utf8'
  );

  const { manifest } = await runProductAnalysisPipeline(snapshotsDir, outDir, 'Brand A', 'task_pipe_legacy');

  assert.equal(manifest.operations, undefined);
  const raw = JSON.parse(await fs.readFile(path.join(outDir, 'manifest.json'), 'utf8'));
  assert.equal('operations' in raw, false);

  await fs.rm(tmpDir, { recursive: true, force: true });
});
