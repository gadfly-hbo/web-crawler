/** CLI 测试：-h、非法参数、默认模式文本输出、退出码、A09 数据保留。 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseArgs } from '../src/cli.js';
import { parseRssEvent } from '../src/events.js';

const pkgDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const entry = path.join(pkgDir, 'src', 'main.ts');
const fixturesDir = path.join(pkgDir, 'test', 'fixtures');

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], extraEnv: Record<string, string> = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', entry, ...args], {
      cwd: pkgDir,
      env: { ...process.env, ...extraEnv },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.on('error', reject);
  });
}

async function withLocalServer(
  handler: (url: string) => { status: number; body: string; type?: string } | undefined,
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = http.createServer((req, res) => {
    const r = handler(req.url ?? '/');
    if (!r) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(r.status, r.type ? { 'content-type': r.type } : undefined);
    res.end(r.body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('rss-collector CLI: parseArgs 纯函数——help/urls/limit/outDir/json/deadline', () => {
  const args = parseArgs([
    '--urls',
    'https://a.example.com/rss,https://b.example.com/rss',
    '--limit',
    '10',
    '-o',
    '/tmp/out',
    '--json',
    '--deadline-ms',
    '5000',
  ]);
  assert.deepEqual(args.urls, ['https://a.example.com/rss', 'https://b.example.com/rss']);
  assert.equal(args.limit, 10);
  assert.equal(args.outDir, '/tmp/out');
  assert.equal(args.json, true);
  assert.equal(args.deadlineMs, 5000);

  assert.equal(parseArgs(['-h']).help, true);
  assert.throws(() => parseArgs([]), /--urls/);
  assert.throws(() => parseArgs(['--urls', 'https://a.example.com/rss']), /--out-dir/);
  assert.throws(() => parseArgs(['--urls', 'https://a.example.com/rss', '-o', '/tmp/o', '--limit', 'abc']), /limit/);
});

test('rss-collector CLI: -h 打印帮助并以 0 退出', async () => {
  const r = await runCli(['-h']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /用法|rss-collector/);
});

test('rss-collector CLI: 校验失败（私网 URL）--json 模式仅发 error 事件且非零退出（G11）', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'rss-cli-err-'));
  try {
    const r = await runCli(['--urls', 'http://127.0.0.1:9/feed.xml', '-o', outDir, '--json']);
    assert.notEqual(r.code, 0);
    const lines = r.stdout.trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 1, '校验期失败只发一行 error');
    const ev = parseRssEvent(lines[0]);
    assert.ok(ev && ev.type === 'error');
    assert.match(ev.message, /内网|回环/);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test('rss-collector CLI: 默认模式输出人类可读文本、无 JSON 行泄漏（G9），部分失败退出码 1', async () => {
  const normalXml = await fs.readFile(path.join(fixturesDir, 'normal-rss.xml'), 'utf8');
  const outDir = await mkdtemp(path.join(tmpdir(), 'rss-cli-text-'));
  try {
    await withLocalServer(
      (url) =>
        url === '/feed.xml'
          ? { status: 200, body: normalXml, type: 'application/rss+xml' }
          : undefined,
      async (baseUrl) => {
        const r = await runCli(
          ['--urls', `${baseUrl}/feed.xml,${baseUrl}/missing.xml`, '-o', outDir],
          { RSS_ALLOW_PRIVATE_ORIGIN: '1' },
        );
        assert.equal(r.code, 1, 'failed > 0 → exit 1');
        for (const line of r.stdout.split('\n')) {
          if (!line.trim()) continue;
          assert.doesNotMatch(line, /^\s*\{.*\}\s*$/, '默认模式不得输出 JSON 行');
        }
        assert.match(r.stdout, /Feed/);
      },
    );
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test('rss-collector CLI: --json 事件流完整（start→company→file×N→done）且产物落盘', async () => {
  const normalXml = await fs.readFile(path.join(fixturesDir, 'normal-rss.xml'), 'utf8');
  const outDir = await mkdtemp(path.join(tmpdir(), 'rss-cli-json-'));
  try {
    await withLocalServer(
      (url) => (url === '/feed.xml' ? { status: 200, body: normalXml, type: 'application/rss+xml' } : undefined),
      async (baseUrl) => {
        const r = await runCli(['--urls', `${baseUrl}/feed.xml`, '-o', outDir, '--json'], {
          RSS_ALLOW_PRIVATE_ORIGIN: '1',
        });
        assert.equal(r.code, 0);
        const events = r.stdout
          .trim()
          .split('\n')
          .map((l) => parseRssEvent(l))
          .filter((e) => e !== null);
        assert.deepEqual(
          events.map((e) => e!.type),
          ['start', 'company', 'file', 'done'],
        );
        const done = events[3];
        assert.ok(done && done.type === 'done');
        assert.equal(done.summary.downloaded, 1);
        assert.equal(done.summary.failed, 0);
        assert.equal(done.summary.matched, 3);
        await fs.access(path.join(outDir, 'manifest.json'));
        await fs.access(path.join(outDir, 'records.jsonl'));
      },
    );
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test('rss-collector CLI: A09 不可信内容作为纯数据落盘（records.jsonl 原样保留）', async () => {
  const maliciousXml = await fs.readFile(path.join(fixturesDir, 'a09-untrusted.xml'), 'utf8');
  const outDir = await mkdtemp(path.join(tmpdir(), 'rss-cli-a09-'));
  try {
    await withLocalServer(
      (url) => (url === '/evil' ? { status: 200, body: maliciousXml } : undefined),
      async (baseUrl) => {
        const feedUrl = `${baseUrl}/evil`;
        const r = await runCli(['--urls', feedUrl, '-o', outDir, '--json'], {
          RSS_ALLOW_PRIVATE_ORIGIN: '1',
        });
        assert.equal(r.code, 0);
        const records = (await fs.readFile(path.join(outDir, 'records.jsonl'), 'utf8')).trim().split('\n');
        const record = JSON.parse(records[0]);
        assert.match(record.title, /<script>alert\('xss'\)<\/script>/);
        assert.match(record.link, /javascript:alert\(1\)/, '伪协议 URL 原样作为数据');
      },
    );
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
