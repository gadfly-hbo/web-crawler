/** spawnRunner 行为测试：行分割、关闭冲刷、SIGTERM→SIGKILL 升级。 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { spawnRunner } from '../server/runner.js';
import type { TaskRecord } from '../server/queue.js';

const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

const TASK = {
  id: 't1',
  title: 't',
  params: { companies: ['x'], industries: [], year: 2024, types: ['annual'], sleepMs: 1000 },
  dryRun: false,
  status: 'running',
  createdAt: new Date().toISOString(),
  totalCompanies: 0,
  companyIndex: 0,
  counts: { downloaded: 0, skipped: 0, failed: 0, matched: 0 },
  failures: [],
  outDir: '/tmp/x',
  logFile: '/tmp/x.log',
} as TaskRecord;

function fixture(name: string) {
  return { command: process.execPath, args: [path.join(fixturesDir, name)], cwd: fixturesDir };
}

test('stdout 按行分割转发，无换行的尾行在关闭时冲刷', async () => {
  const lines: string[] = [];
  const run = spawnRunner(fixture('fake-crawler.mjs'));
  const handle = run(TASK, (l) => lines.push(l));
  const exit = await handle.done;
  assert.equal(exit.code, 0);
  assert.deepEqual(
    lines.map((l) => JSON.parse(l).type),
    ['start', 'done'],
  );
});

test('cancel 发送 SIGTERM，进程正常退出', async () => {
  const run = spawnRunner(fixture('slow-crawler.mjs'));
  let ready!: () => void;
  const readyP = new Promise<void>((r) => (ready = r));
  const handle = run(TASK, () => ready());
  await readyP; // 等子进程打出第一行，确保 SIGTERM 处理器已注册
  handle.cancel();
  const exit = await handle.done;
  assert.equal(exit.code, 0);
});

test('spawn 失败（命令不存在）转为 error 行并结束，不抛 unhandled', async () => {
  const run = spawnRunner({ command: '/nonexistent/definitely-missing', args: [], cwd: fixturesDir });
  const lines: string[] = [];
  const handle = run(TASK, (l) => lines.push(l));
  const exit = await handle.done;
  assert.equal(exit.code, null);
  assert.ok(lines.some((l) => l.includes('"error"') || l.includes('"stderr"')), `应有 error 行，实际：${lines}`);
});

test('SIGTERM 无效时在宽限期后升级 SIGKILL', async () => {
  const run = spawnRunner(fixture('stubborn-crawler.mjs'), { killGraceMs: 100 });
  let ready!: () => void;
  const readyP = new Promise<void>((r) => (ready = r));
  const handle = run(TASK, () => ready());
  await readyP;
  const started = Date.now();
  handle.cancel();
  const exit = await handle.done;
  assert.equal(exit.signal, 'SIGKILL');
  assert.ok(Date.now() - started < 5000, '应在宽限期后迅速被杀掉');
});
