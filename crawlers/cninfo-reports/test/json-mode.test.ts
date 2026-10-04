/** --json 事件流的端到端测试：以本地假巨潮服务器为系统边界替身，驱动真实 CLI 子进程。 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const crawlerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const STOCKS = {
  stockList: [
    { code: '000001', zwjc: '平安银行', pinyin: 'PAYH', orgId: 'gssz0000001', category: 'A股' },
  ],
};

/** 一份合规年报 + 一份应被排除的「摘要」，用于验证计数口径。 */
const ANNOUNCEMENTS = [
  {
    announcementId: 'a1',
    secCode: '000001',
    secName: '平安银行',
    announcementTitle: '平安银行：2024年年度报告',
    announcementTime: Date.UTC(2025, 2, 15),
    adjunctUrl: 'finalpage/a1.PDF',
  },
  {
    announcementId: 'a2',
    secCode: '000001',
    secName: '平安银行',
    announcementTitle: '平安银行：2024年年度报告摘要',
    announcementTime: Date.UTC(2025, 2, 15),
    adjunctUrl: 'finalpage/a2.PDF',
  },
];

interface FakeCninfo {
  env: NodeJS.ProcessEnv;
  close: () => Promise<void>;
}

interface FakeCninfoOptions {
  onQuery?: (params: URLSearchParams, req: any, res: any) => boolean | void;
  onDownload?: (urlPath: string, req: any, res: any) => boolean | void;
}

async function startFakeCninfo(options?: FakeCninfoOptions): Promise<FakeCninfo> {
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/new/data/szse_stock.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(STOCKS));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/new/hisAnnouncement/query') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const params = new URLSearchParams(body);
        if (options?.onQuery && options.onQuery(params, req, res)) return;
        if (params.get('trade') === '金融业') {
          // 4xx：触发不重试的查询失败路径
          res.writeHead(400).end('bad trade');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            announcements: ANNOUNCEMENTS,
            totalAnnouncement: ANNOUNCEMENTS.length,
            hasMore: false,
          }),
        );
      });
      return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/finalpage/')) {
      if (options?.onDownload && options.onDownload(url.pathname, req, res)) return;
      res.writeHead(200, { 'Content-Type': 'application/pdf' });
      res.end(`%PDF-fake-${url.pathname}`);
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

interface CliRun {
  code: number | null;
  stdout: string;
  stderr: string;
  /** stdout 逐行解析出的 JSON 事件（非 JSON 行会被剔除，断言行格式请用 rawLines）。 */
  events: Array<Record<string, unknown>>;
  rawLines: string[];
}

async function runCli(args: string[], env: NodeJS.ProcessEnv = {}): Promise<CliRun> {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts', ...args], {
    cwd: crawlerDir,
    env: { ...process.env, ...env },
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => (stdout += d));
  child.stderr.on('data', (d) => (stderr += d));
  const code = await new Promise<number | null>((resolve) => child.on('close', resolve));
  const rawLines = stdout.trim() ? stdout.trim().split('\n') : [];
  const events: Array<Record<string, unknown>> = [];
  for (const l of rawLines) {
    try {
      events.push(JSON.parse(l) as Record<string, unknown>);
    } catch {
      // 人类可读行（默认模式），不作为事件
    }
  }
  return { code, stdout, stderr, events, rawLines };
}

test('--json 正式运行输出 start→company→file→done 序列，文件落盘且索引追加', async () => {
  const fake = await startFakeCninfo();
  const out = await mkdtemp(path.join(tmpdir(), 'cninfo-json-'));
  try {
    const r = await runCli(
      ['--json', '-c', '平安银行', '--year', '2024', '-t', 'annual', '-o', out, '--sleep', '200'],
      fake.env,
    );
    assert.equal(r.code, 0, r.stderr);
    for (const line of r.rawLines) assert.doesNotThrow(() => JSON.parse(line), line);

    const types = r.events.map((e) => e.type);
    assert.deepEqual(types, ['start', 'company', 'file', 'done']);

    const start = r.events[0];
    assert.deepEqual(start, { type: 'start', totalCompanies: 1, dryRun: false });

    const company = r.events[1];
    assert.deepEqual(company, { type: 'company', index: 1, total: 1, code: '000001', name: '平安银行' });

    const file = r.events[2];
    assert.equal(file.type, 'file');
    assert.equal(file.status, 'downloaded');
    assert.equal(file.code, '000001');
    assert.equal(file.reportType, 'annual');
    assert.equal(file.title, '平安银行：2024年年度报告');
    assert.equal(typeof file.bytes, 'number');
    assert.match(String(file.path), /^000001_平安银行\/2025-03-15_.*\.pdf$/);

    const done = r.events[3];
    assert.equal(done.type, 'done');
    const summary = done.summary as Record<string, unknown>;
    assert.deepEqual(
      { companies: summary.companies, matched: summary.matched, downloaded: summary.downloaded, skipped: summary.skipped, failed: summary.failed },
      { companies: 1, matched: 1, downloaded: 1, skipped: 0, failed: 0 },
    );

    // 文件真实落盘，内容与假服务器一致；索引 jsonl 追加一行
    const written = await readFile(path.join(out, 'reports', String(file.path)));
    assert.equal(written.toString(), '%PDF-fake-/finalpage/a1.PDF');
    const indexLines = (await readFile(path.join(out, 'index.jsonl'), 'utf8')).trim().split('\n');
    assert.equal(indexLines.length, 1);
    assert.equal(JSON.parse(indexLines[0]).status, 'downloaded');
  } finally {
    await fake.close();
    await rm(out, { recursive: true, force: true });
  }
});

test('第二遍运行对同一份报告发出 skipped 事件', async () => {
  const fake = await startFakeCninfo();
  const out = await mkdtemp(path.join(tmpdir(), 'cninfo-json-'));
  const args = ['--json', '-c', '平安银行', '--year', '2024', '-t', 'annual', '-o', out, '--sleep', '200'];
  try {
    await runCli(args, fake.env);
    const r = await runCli(args, fake.env);
    assert.equal(r.code, 0, r.stderr);
    const file = r.events.find((e) => e.type === 'file');
    assert.equal(file?.status, 'skipped');
    const done = r.events.find((e) => e.type === 'done');
    assert.equal((done?.summary as Record<string, unknown>).skipped, 1);
    assert.equal((done?.summary as Record<string, unknown>).downloaded, 0);
  } finally {
    await fake.close();
    await rm(out, { recursive: true, force: true });
  }
});

test('检索目标失败时发出 queryError 事件，done 计数 failed 且退出码为 1', async () => {
  const fake = await startFakeCninfo();
  const out = await mkdtemp(path.join(tmpdir(), 'cninfo-json-'));
  try {
    const r = await runCli(
      ['--json', '-i', '金融业', '--year', '2024', '-t', 'annual', '-o', out, '--sleep', '200'],
      fake.env,
    );
    assert.equal(r.code, 1);
    const qe = r.events.find((e) => e.type === 'queryError');
    assert.equal(qe?.target, '金融业');
    assert.match(String(qe?.reason), /HTTP 400/);
    const done = r.events.find((e) => e.type === 'done');
    assert.equal((done?.summary as Record<string, unknown>).failed, 1);
  } finally {
    await fake.close();
    await rm(out, { recursive: true, force: true });
  }
});

test('--json 模式参数校验失败输出 error 事件且退出码非零', async () => {
  const r = await runCli(['--json', '-c', '平安银行']);
  assert.notEqual(r.code, 0);
  assert.ok(r.rawLines.length > 0, '应至少有一行输出');
  for (const line of r.rawLines) assert.doesNotThrow(() => JSON.parse(line), line);
  const err = r.events.find((e) => e.type === 'error');
  assert.ok(err, '应有 error 事件');
  assert.match(String(err.message), /必须指定时间/);
});

test('默认模式（无 --json）输出人类可读文本且无 JSON 行', async () => {
  const fake = await startFakeCninfo();
  const out = await mkdtemp(path.join(tmpdir(), 'cninfo-json-'));
  try {
    const r = await runCli(
      ['-c', '平安银行', '--year', '2024', '-t', 'annual', '-o', out, '--sleep', '200'],
      fake.env,
    );
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /完成：1 家公司，匹配 1 份报告/);
    for (const line of r.rawLines) {
      let isJson = true;
      try {
        JSON.parse(line);
      } catch {
        isJson = false;
      }
      assert.equal(isJson, false, `默认模式不应出现 JSON 行：${line}`);
    }
  } finally {
    await fake.close();
    await rm(out, { recursive: true, force: true });
  }
});

test('--json --dry-run 输出纯 NDJSON 与 preview 事件（摘要被排除），且不写任何文件', async () => {
  const fake = await startFakeCninfo();
  const out = await mkdtemp(path.join(tmpdir(), 'cninfo-json-'));
  try {
    const r = await runCli(
      ['--json', '--dry-run', '-c', '平安银行', '--year', '2024', '-t', 'annual', '-o', out, '--sleep', '200'],
      fake.env,
    );
    assert.equal(r.code, 0, r.stderr);
    assert.ok(r.rawLines.length > 0, 'json 模式应有事件输出');
    // 每一行都必须能解析为 JSON——人类可读文本泄漏即失败
    for (const line of r.rawLines) assert.doesNotThrow(() => JSON.parse(line), line);
    const previews = r.events.filter((e) => e.type === 'preview');
    assert.equal(previews.length, 1);
    assert.deepEqual(previews[0], { type: 'preview', companies: 1, reports: 1 });
    assert.deepEqual(await readdir(out), [], 'dry-run 不应写文件');
  } finally {
    await fake.close();
    await rm(out, { recursive: true, force: true });
  }
});

test('单报告下载失败不中断同公司后续报告，失败事件携带 title 且清理 .part 文件 (B1/B2)', async () => {
  const announcements = [
    {
      announcementId: 'b1',
      secCode: '000001',
      secName: '平安银行',
      announcementTitle: '平安银行：2024年年度报告',
      announcementTime: Date.UTC(2025, 2, 15),
      adjunctUrl: 'finalpage/b1.PDF',
    },
    {
      announcementId: 'b2',
      secCode: '000001',
      secName: '平安银行',
      announcementTitle: '平安银行：2024年第一季度报告',
      announcementTime: Date.UTC(2024, 3, 20),
      adjunctUrl: 'finalpage/b2.PDF',
    },
  ];
  const fake = await startFakeCninfo({
    onQuery: (_params, _req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ announcements, totalAnnouncement: 2, hasMore: false }));
      return true;
    },
    onDownload: (urlPath, _req, res) => {
      if (urlPath.includes('b1')) {
        res.writeHead(500).end('server error');
        return true;
      }
      return false;
    },
  });
  const out = await mkdtemp(path.join(tmpdir(), 'cninfo-b1b2-'));
  try {
    const r = await runCli(
      ['--json', '-c', '平安银行', '--year', '2024', '-t', 'annual,q1', '-o', out, '--sleep', '200'],
      fake.env,
    );
    assert.equal(r.code, 1, '有失败项时退出码为 1');
    const fileEvents = r.events.filter((e) => e.type === 'file');
    assert.equal(fileEvents.length, 2);

    const failed = fileEvents.find((e) => e.status === 'failed');
    assert.ok(failed, '应包含失败事件');
    assert.equal(failed.title, '平安银行：2024年年度报告');
    assert.equal(failed.reportType, 'annual');
    assert.match(String(failed.reason), /500/);

    const downloaded = fileEvents.find((e) => e.status === 'downloaded');
    assert.ok(downloaded, '应包含成功下载事件（未被中断）');
    assert.equal(downloaded.title, '平安银行：2024年第一季度报告');

    // 检查磁盘目录：不存在 b1 的 pdf 或 part 文件，b2 的 pdf 正常存在
    const companyDir = path.join(out, 'reports', '000001_平安银行');
    const files = await readdir(companyDir);
    assert.equal(files.some((f) => f.endsWith('.part')), false, '不应残留 .part 文件');
    assert.equal(files.some((f) => f.includes('2024年年度报告')), false, '失败文件不应残留');
    assert.equal(files.some((f) => f.includes('2024年第一季度报告') && f.endsWith('.pdf')), true, '成功文件应正常存在');
  } finally {
    await fake.close();
    await rm(out, { recursive: true, force: true });
  }
});

test('第 100 页 hasMore: true 时发射 queryError 并计入失败，杜绝静默截断 (B3)', async () => {
  const fake = await startFakeCninfo({
    onQuery: (params, _req, res) => {
      const page = Number(params.get('pageNum'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      // 模拟前 99 页有数据且 hasMore，第 100 页依然 hasMore: true
      res.end(
        JSON.stringify({
          announcements: [
            {
              announcementId: `p${page}`,
              secCode: '000001',
              secName: '平安银行',
              announcementTitle: `平安银行：2024年年度报告${page}`,
              announcementTime: Date.UTC(2025, 2, 15),
              adjunctUrl: `finalpage/p${page}.PDF`,
            },
          ],
          totalAnnouncement: 3500,
          hasMore: true,
        }),
      );
      return true;
    },
  });
  const out = await mkdtemp(path.join(tmpdir(), 'cninfo-trunc-'));
  try {
    const r = await runCli(
      ['--json', '-c', '平安银行', '--year', '2024', '-t', 'annual', '-o', out, '--sleep', '200'],
      fake.env,
    );
    assert.equal(r.code, 1);
    const qe = r.events.find((e) => e.type === 'queryError');
    assert.ok(qe, '必须发出 queryError');
    assert.match(String(qe.reason), /超过巨潮翻页上限/);
    const done = r.events.find((e) => e.type === 'done');
    assert.equal((done?.summary as Record<string, unknown>).failed, 1);
  } finally {
    await fake.close();
    await rm(out, { recursive: true, force: true });
  }
});

test('年份模式窗口收窄（仅年报查 Y+1，仅季报查 Y，混合查 Y~Y+1）(B3)', async () => {
  const capturedDates: string[] = [];
  const fake = await startFakeCninfo({
    onQuery: (params, _req, res) => {
      capturedDates.push(params.get('seDate') ?? '');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ announcements: [], totalAnnouncement: 0, hasMore: false }));
      return true;
    },
  });
  const out = await mkdtemp(path.join(tmpdir(), 'cninfo-window-'));
  try {
    // 仅 annual
    capturedDates.length = 0;
    await runCli(['--json', '-c', '平安银行', '--year', '2024', '-t', 'annual', '-o', out, '--sleep', '200'], fake.env);
    assert.equal(capturedDates[0], '2025-01-01~2025-12-31');

    // 仅季度/中报
    capturedDates.length = 0;
    await runCli(['--json', '-c', '平安银行', '--year', '2024', '-t', 'q1,semi', '-o', out, '--sleep', '200'], fake.env);
    assert.equal(capturedDates[0], '2024-01-01~2024-12-31');

    // 混合
    capturedDates.length = 0;
    await runCli(['--json', '-c', '平安银行', '--year', '2024', '-t', 'annual,q1', '-o', out, '--sleep', '200'], fake.env);
    assert.equal(capturedDates[0], '2024-01-01~2025-12-31');
  } finally {
    await fake.close();
    await rm(out, { recursive: true, force: true });
  }
});

