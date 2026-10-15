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

  const entries = await fs.readdir(tmpDir, { withFileTypes: true });
  const snapDir = entries.find((e) => e.isDirectory());
  assert.ok(snapDir);
  const metadata = JSON.parse(
    await fs.readFile(path.join(tmpDir, snapDir.name, 'metadata.json'), 'utf8')
  );
  assert.equal(metadata.provider, 'mock_adapter');

  await fs.rm(tmpDir, { recursive: true, force: true });
});
