import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ScraperEngine } from '../src/engine.js';
import { type ScrapeEvent, parseScrapeEvent } from '../src/events.js';
import { MockAcquisitionAdapter } from '../src/mock-adapter.js';

test('ScraperEngine: 触发完整的事件流并产生快照', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-engine-test-'));
  const events: ScrapeEvent[] = [];

  const adapter = new MockAcquisitionAdapter([
    {
      matchUrl: 'bad-page',
      errorStatus: 500,
      errorMessage: 'Internal Server Error'
    }
  ]);

  const engine = new ScraperEngine({
    outDir: tmpDir,
    adapter,
    reporter: (e) => events.push(e)
  });

  const urls = [
    'https://example.com/good-1',
    'https://example.com/bad-page',
    'https://example.com/good-2'
  ];

  const summary = await engine.run(urls);

  assert.equal(summary.total, 3);
  assert.equal(summary.succeeded, 2);
  assert.equal(summary.failed, 1);

  // 验证事件流序列
  assert.equal(events[0].type, 'start');
  assert.equal(events[events.length - 1].type, 'done');

  const snapshotSavedEvents = events.filter((e) => e.type === 'snapshot_saved');
  assert.equal(snapshotSavedEvents.length, 2);

  const failedEvents = events.filter((e) => e.type === 'scrape_failed');
  assert.equal(failedEvents.length, 1);

  // 验证 parseScrapeEvent
  const jsonLine = JSON.stringify(events[0]);
  const parsed = parseScrapeEvent(jsonLine);
  assert.ok(parsed);
  assert.equal(parsed.type, 'start');

  assert.equal(parseScrapeEvent('invalid json line'), null);

  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('ScraperEngine: 落盘快照 metadata 含真实 provider（mock_adapter）', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-engine-provider-'));

  const engine = new ScraperEngine({
    outDir: tmpDir,
    adapter: new MockAcquisitionAdapter([])
  });

  const summary = await engine.run(['https://example.com/good-1']);
  assert.equal(summary.succeeded, 1);

  // F6 修复后契约：快照统一落 outDir/snapshots/ 子目录（G1 两层定位，锁目录名=锁三消费端契约）
  // G1 措辞精度（质量收尾批 T3）：全量 readdir（含文件）——顶层散落任何文件即红
  const topNames = (await fs.readdir(tmpDir)).sort();
  assert.deepEqual(topNames, ['snapshots'], `顶层应恰为 snapshots/ 一个条目（含文件），实得 ${topNames.join(',')}`);
  const snapEntries = await fs.readdir(path.join(tmpDir, 'snapshots'), { withFileTypes: true });
  const snapDir = snapEntries.find((e) => e.isDirectory() && e.name.startsWith('snap_'));
  assert.ok(snapDir, 'snapshots/ 下应存在 snap_* 快照目录');
  const metadata = JSON.parse(
    await fs.readFile(path.join(tmpDir, 'snapshots', snapDir.name, 'metadata.json'), 'utf8')
  );
  assert.equal(metadata.provider, 'mock_adapter');

  await fs.rm(tmpDir, { recursive: true, force: true });
});
