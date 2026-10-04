/**
 * CLI 默认人类可读文本输出的逐字节快照对齐测试。
 * 确保重构后非 --json 模式下的控制台输出逐字逐句与基准完全一致。
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { parseArgs } from '../src/cli.js';

const crawlerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const STOCKS = {
  stockList: [
    { code: '000001', zwjc: '平安银行', pinyin: 'PAYH', orgId: 'gssz0000001', category: 'A股' },
  ],
};

const ANNOUNCEMENTS = [
  {
    announcementId: 'a1',
    secCode: '000001',
    secName: '平安银行',
    announcementTitle: '平安银行：2024年年度报告',
    announcementTime: Date.UTC(2025, 2, 15),
    adjunctUrl: 'finalpage/a1.PDF',
  },
];

async function startFakeCninfo(): Promise<{ env: NodeJS.ProcessEnv; close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/new/data/szse_stock.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(STOCKS));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/new/hisAnnouncement/query') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          announcements: ANNOUNCEMENTS,
          totalAnnouncement: ANNOUNCEMENTS.length,
          hasMore: false,
        }),
      );
      return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/finalpage/')) {
      res.writeHead(200, { 'Content-Type': 'application/pdf' });
      res.end('%PDF-fake-content');
      return;
    }
    res.writeHead(404).end('not found');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  return {
    env: {
      CNINFO_ORIGIN: `http://127.0.0.1:${port}`,
      CNINFO_STATIC_ORIGIN: `http://127.0.0.1:${port}`,
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

async function runCli(args: string[], env: NodeJS.ProcessEnv = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts', ...args], {
    cwd: crawlerDir,
    env: { ...process.env, ...env },
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => (stdout += d));
  child.stderr.on('data', (d) => (stderr += d));
  const code = await new Promise<number | null>((resolve) => child.on('close', resolve));
  return { code, stdout, stderr };
}

test('CLI 默认模式下载输出逐字节对齐基准快照', async () => {
  const fake = await startFakeCninfo();
  const out = await mkdtemp(path.join(tmpdir(), 'cninfo-snap-'));
  try {
    const r = await runCli(
      ['-c', '平安银行', '--year', '2024', '-t', 'annual', '-o', out, '--sleep', '200'],
      fake.env,
    );
    assert.equal(r.code, 0, r.stderr);

    const normalized = r.stdout.replaceAll(out, '<OUT_DIR>');
    const expected = [
      '获取全量证券清单…',
      '公司：000001 平安银行',
      '',
      '检索目标 1 个；报告类型：年报；公告发布窗口：2025-01-01~2025-12-31',
      '输出目录：<OUT_DIR>',
      '',
      '检索：000001 平安银行',
      '  候选公告 1 条，匹配 1 条',
      '涉及公司 1 家',
      '',
      '=== [1/1] 000001 平安银行 ===',
      '  ↓ [年报] 000001_平安银行/2025-03-15_平安银行：2024年年度报告.pdf（1KB）',
      '',
      '完成：1 家公司，匹配 1 份报告，新下载 1 份（1KB），已存在跳过 0 份，失败 0 处',
      'PDF 目录：<OUT_DIR>/reports',
      '索引文件：<OUT_DIR>/index.jsonl',
      '',
    ].join('\n');

    assert.equal(normalized, expected);
  } finally {
    await fake.close();
    await rm(out, { recursive: true, force: true });
  }
});

test('CLI 默认模式 dry-run 输出逐字节对齐基准快照', async () => {
  const fake = await startFakeCninfo();
  const out = await mkdtemp(path.join(tmpdir(), 'cninfo-snap-dry-'));
  try {
    const r = await runCli(
      ['--dry-run', '-c', '平安银行', '--year', '2024', '-t', 'annual', '-o', out, '--sleep', '200'],
      fake.env,
    );
    assert.equal(r.code, 0, r.stderr);

    const normalized = r.stdout.replaceAll(out, '<OUT_DIR>');
    const expected = [
      '获取全量证券清单…',
      '公司：000001 平安银行',
      '',
      '检索目标 1 个；报告类型：年报；公告发布窗口：2025-01-01~2025-12-31',
      '输出目录：<OUT_DIR>',
      '【dry-run】仅列出待下载文件，不写入任何数据',
      '',
      '检索：000001 平安银行',
      '  候选公告 1 条，匹配 1 条',
      '涉及公司 1 家',
      '',
      '=== [1/1] 000001 平安银行 ===',
      '  [dry-run] [年报] 000001_平安银行/2025-03-15_平安银行：2024年年度报告.pdf',
      '',
      '完成：1 家公司，匹配 1 份报告，新下载 0 份（1KB），已存在跳过 0 份，失败 0 处',
      '',
    ].join('\n');

    assert.equal(normalized, expected);
  } finally {
    await fake.close();
    await rm(out, { recursive: true, force: true });
  }
});

test('parseArgs 纯函数化：-h/--help 返回 help: true 且不退出进程', () => {
  const res1 = parseArgs(['-h']);
  assert.equal(res1.help, true);
  const res2 = parseArgs(['--help']);
  assert.equal(res2.help, true);
});

test('CLI -h 输出帮助文本且退出码为 0', async () => {
  const r = await runCli(['-h']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /用法：pnpm --filter cninfo-reports start/);
});

