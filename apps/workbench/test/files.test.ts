/** 切片 4 API 测试：文件清单/下载（含路径穿越防护）/zip 打包/Finder 显示。 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { buildApp } from '../server/app.js';
import { TaskQueue, type Runner } from '../server/queue.js';
import { StockDirectory } from '../server/stocks.js';
import type { TaskParams } from '../shared/task-params.js';

const PARAMS: TaskParams = { companies: ['平安银行'], industries: [], year: 2024, types: ['annual'], sleepMs: 1000 };

const doneRunner: Runner = (_task, emit) => {
  emit(JSON.stringify({ type: 'done', summary: { companies: 1, matched: 1, downloaded: 1, skipped: 0, bytes: 3, failed: 0, outDir: '/x' } }));
  return { done: Promise.resolve(), cancel: () => {} };
};

async function withFilesApp(fn: (app: ReturnType<typeof buildApp>, ctx: { taskId: string; outDir: string; revealed: string[] }) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'wb-files-'));
  const revealed: string[] = [];
  const q = new TaskQueue({ runner: doneRunner, dataRoot: dir });
  try {
    await q.init();
    const app = buildApp({
      queue: q,
      stocks: new StockDirectory({ origin: 'http://127.0.0.1:1' }),
      reveal: (p) => revealed.push(p),
    });
    const t = await q.create(PARAMS, false);
    await q.close();
    const outDir = t.outDir;
    await mkdir(path.join(outDir, 'reports', '000001_平安银行'), { recursive: true });
    await writeFile(path.join(outDir, 'reports', '000001_平安银行', '2025-03-15_2024年年度报告.pdf'), '%PDF-abc');
    await writeFile(path.join(outDir, 'index.jsonl'), '{"status":"downloaded"}\n');
    await fn(app, { taskId: t.id, outDir, revealed });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('GET /api/task/:id/files 列出输出目录文件（含大小），磁盘删除后消失', async () => {
  await withFilesApp(async (app, { taskId, outDir }) => {
    const res = await app.request(`/api/task/${taskId}/files`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    const paths = body.files.map((f: { path: string }) => f.path).sort();
    assert.deepEqual(paths, ['index.jsonl', 'reports/000001_平安银行/2025-03-15_2024年年度报告.pdf']);
    const pdf = body.files.find((f: { path: string }) => f.path.endsWith('.pdf'));
    assert.equal(pdf.size, 8);

    // 磁盘是事实源：删掉即消失
    await unlink(path.join(outDir, 'index.jsonl'));
    const body2 = (await (await app.request(`/api/task/${taskId}/files`)).json()) as any;
    assert.deepEqual(body2.files.map((f: { path: string }) => f.path), ['reports/000001_平安银行/2025-03-15_2024年年度报告.pdf']);
  });
});

test('GET /api/task/:id/files/:path 下载文件；路径穿越被拒绝', async () => {
  await withFilesApp(async (app, { taskId }) => {
    const ok = await app.request(`/api/task/${taskId}/files/${encodeURIComponent('reports/000001_平安银行/2025-03-15_2024年年度报告.pdf')}`);
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), '%PDF-abc');

    // 逐段编码的 ../ 与未编码的 ../ 都不能逃出任务目录
    for (const p of ['../../queue.ts', '..%2F..%2Fqueue.ts', '%2e%2e%2f%2e%2e%2fqueue.ts']) {
      const bad = await app.request(`/api/task/${taskId}/files/${p}`);
      assert.ok([400, 404].includes(bad.status), `${p} 应被拒绝，实际 ${bad.status}`);
    }
    const missing = await app.request(`/api/task/${taskId}/files/${encodeURIComponent('reports/nope.pdf')}`);
    assert.equal(missing.status, 404);
  });
});

test('GET /api/task/:id/archive 流式产出可用 zip', async () => {
  await withFilesApp(async (app, { taskId }) => {
    const res = await app.request(`/api/task/${taskId}/archive`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/zip');
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.subarray(0, 2).toString(), 'PK', '应是 zip 魔数');
    assert.ok(buf.length > 100, 'zip 应包含文件内容');
  });
});

test('POST /api/task/:id/reveal 调用注入的 reveal（macOS open 的替身）', async () => {
  await withFilesApp(async (app, { taskId, outDir, revealed }) => {
    const res = await app.request(`/api/task/${taskId}/reveal`, { method: 'POST' });
    assert.equal(res.status, 200);
    assert.deepEqual(revealed, [outDir]);
    const missing = await app.request('/api/task/nope/reveal', { method: 'POST' });
    assert.equal(missing.status, 404);
  });
});

test('dry-run 任务没有输出目录时 files 返回空清单而非报错', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wb-files-'));
  try {
    const q = new TaskQueue({ runner: doneRunner, dataRoot: dir });
    await q.init();
    const app = buildApp({ queue: q, stocks: new StockDirectory({ origin: 'http://127.0.0.1:1' }), reveal: () => {} });
    const t = await q.create(PARAMS, true);
    await q.close();
    const res = await app.request(`/api/task/${t.id}/files`);
    assert.equal(res.status, 200);
    assert.deepEqual(((await res.json()) as { files: unknown[] }).files, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
