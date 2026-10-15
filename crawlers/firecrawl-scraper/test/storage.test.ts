import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { AcquisitionResult } from '../src/port.js';
import { SnapshotStorage } from '../src/storage.js';

test('SnapshotStorage: 原子保存 Markdown 与 HTML 快照并生成 metadata', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-storage-test-'));
  const storage = new SnapshotStorage(tmpDir);

  const mockResult: AcquisitionResult = {
    success: true,
    targetUrl: 'https://example.com/item/1001',
    finalUrl: 'https://example.com/item/1001',
    statusCode: 200,
    markdown: '# Test Product\n\nPrice: $99.99',
    html: '<div><h1>Test Product</h1><span>$99.99</span></div>',
    requestedAt: '2026-10-06T08:00:00.000Z',
    receivedAt: '2026-10-06T08:00:01.000Z'
  };

  const saved = await storage.saveSnapshot(mockResult, 'snap_test_001');

  assert.equal(saved.snapshotId, 'snap_test_001');
  assert.ok(saved.contentHash.length === 64, 'SHA-256 哈希应为 64 位十六进制');

  // 验证目标文件已写入
  const snapDir = saved.snapshotDir;
  const mdContent = await fs.readFile(path.join(snapDir, 'content.md'), 'utf8');
  assert.equal(mdContent, mockResult.markdown);

  const htmlContent = await fs.readFile(path.join(snapDir, 'content.html'), 'utf8');
  assert.equal(htmlContent, mockResult.html);

  // 验证 metadata
  const meta = await storage.readMetadata('snap_test_001');
  assert.ok(meta);
  assert.equal(meta.snapshot_id, 'snap_test_001');
  assert.equal(meta.target_url, 'https://example.com/item/1001');
  assert.equal(meta.status_code, 200);
  assert.equal(meta.content_hash, saved.contentHash);
  assert.deepEqual(meta.formats, ['markdown', 'html']);

  // 清理
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('SnapshotStorage: 异常情况下临时目录自动清理', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-storage-err-'));
  const storage = new SnapshotStorage(tmpDir);

  // 模拟非法路径或只读目录导致的保存中断
  const mockResult: AcquisitionResult = {
    success: true,
    targetUrl: 'https://example.com/fail',
    statusCode: 200,
    markdown: 'test',
    requestedAt: new Date().toISOString(),
    receivedAt: new Date().toISOString()
  };

  const saved = await storage.saveSnapshot(mockResult);
  assert.ok(saved.snapshotId);

  // 确认 snapshots 目录下没有残留的 .tmp 目录
  const files = await fs.readdir(storage.getSnapshotsDir());
  const tmpFiles = files.filter((f) => f.endsWith('.tmp'));
  assert.equal(tmpFiles.length, 0, '不应残留 .tmp 临时目录');

  await fs.rm(tmpDir, { recursive: true, force: true });
});
