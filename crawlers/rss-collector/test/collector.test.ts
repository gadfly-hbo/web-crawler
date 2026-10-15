/** collector 编排测试：fetchFn 注入 seam（公网 URL + 合成 Response，无需豁免）+ 本地真服务器（带豁免 env）。 */
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { verifyDeliveryPackage } from 'data-governance/manifest';

import { runRssCollector, RssValidationError } from '../src/collector.js';
import type { RssEvent } from '../src/events.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

async function fixture(name: string): Promise<string> {
  return fs.readFile(path.join(fixturesDir, name), 'utf8');
}

function syntheticResponse(status: number, body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers });
}

/** 记录全部请求 URL 的注入 fetch；按路由表回放合成 Response。 */
function makeRecordingFetch(routes: Array<{ match: (url: string) => boolean; respond: (url: string) => Response | Promise<Response> }>) {
  const requestedUrls: string[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requestedUrls.push(url);
    const signal = init?.signal;
    if (signal instanceof AbortSignal && signal.aborted) {
      throw new DOMException('aborted', 'AbortError');
    }
    const route = routes.find((r) => r.match(url));
    if (!route) return syntheticResponse(404, 'not found');
    return route.respond(url);
  }) as typeof fetch;
  return { fetchFn, requestedUrls };
}

function collectEvents(): { events: RssEvent[]; reporter: (ev: RssEvent) => void } {
  const events: RssEvent[] = [];
  return { events, reporter: (ev) => events.push(ev) };
}

async function tmpOut(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'rss-collector-'));
}

const PUBLIC_FEED = 'https://news.example.com/feed.xml';

test('rss-collector 编排: 正常采集落盘（content.xml + 哈希 + 双时间戳）并事件流完整', async () => {
  const outDir = await tmpOut();
  try {
    const xml = await fixture('normal-rss.xml');
    const { fetchFn, requestedUrls } = makeRecordingFetch([
      { match: (u) => u === PUBLIC_FEED, respond: () => syntheticResponse(200, xml, { 'content-type': 'application/rss+xml' }) },
    ]);
    const { events, reporter } = collectEvents();
    const result = await runRssCollector({ urls: [PUBLIC_FEED], outDir, fetchFn, reporter });

    assert.equal(result.summary.failed, 0);
    assert.equal(result.summary.downloaded, 1);
    assert.equal(result.summary.matched, 3);

    const snapDir = path.join(outDir, 'snapshots');
    const entries = await fs.readdir(snapDir);
    assert.equal(entries.length, 1);
    const meta = JSON.parse(await fs.readFile(path.join(snapDir, entries[0], 'metadata.json'), 'utf8'));
    assert.equal(meta.files.xml, 'content.xml');
    assert.ok(meta.content_hash);
    assert.ok(meta.requested_at && meta.received_at, '双时间戳');
    assert.equal(meta.provider, 'rss_native_fetch');
    assert.equal(meta.target_url, PUBLIC_FEED);
    assert.equal(await fs.readFile(path.join(snapDir, entries[0], 'content.xml'), 'utf8'), xml);

    // 事件流：start → company → file downloaded → done（G5/G11）
    assert.deepEqual(
      events.map((e) => e.type),
      ['start', 'company', 'file', 'done'],
    );
    const done = events[3];
    assert.equal(done.type, 'done');
    assert.equal(done.summary.downloaded, 1);
    assert.equal(done.summary.failed, 0);
    assert.equal(done.summary.companies, 1);
    assert.equal(done.summary.matched, 3);

    // A12/A20：条目链接零跟随（fetch 只打到 Feed 本身）
    assert.deepEqual(requestedUrls, [PUBLIC_FEED]);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test('rss-collector 编排: 404/500 取得响应但不可用 → file failed（G5 分界）', async () => {
  const outDir = await tmpOut();
  try {
    for (const status of [404, 500]) {
      const { fetchFn } = makeRecordingFetch([
        { match: () => true, respond: () => syntheticResponse(status, 'err') },
      ]);
      const { events, reporter } = collectEvents();
      const result = await runRssCollector({ urls: [PUBLIC_FEED], outDir, fetchFn, reporter, deadlineMs: 5000 });
      assert.equal(result.summary.failed, 1, `HTTP ${status}`);
      const fileEv = events.find((e) => e.type === 'file');
      assert.ok(fileEv && fileEv.type === 'file' && fileEv.status === 'failed');
      assert.match(fileEv.reason ?? '', new RegExp(`HTTP ${status}`));
    }
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test('rss-collector 编排: 挑战页/HTML 响应 → file failed 且 reason 注明非合法 Feed（A05）', async () => {
  const outDir = await tmpOut();
  try {
    const { fetchFn } = makeRecordingFetch([
      { match: () => true, respond: () => syntheticResponse(200, '<html><body>请完成验证</body></html>', { 'content-type': 'text/html' }) },
    ]);
    const { events, reporter } = collectEvents();
    const result = await runRssCollector({ urls: [PUBLIC_FEED], outDir, fetchFn, reporter });
    assert.equal(result.summary.failed, 1);
    assert.equal(result.summary.matched, 0);
    const fileEv = events.find((e) => e.type === 'file');
    assert.ok(fileEv && fileEv.type === 'file' && fileEv.status === 'failed');
    assert.match(fileEv.reason ?? '', /不是合法 Feed/);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test('rss-collector 编排: 302 跳公网逐跳跟随成功、跳私网被拦（A10）', async () => {
  const outDir = await tmpOut();
  try {
    const xml = await fixture('empty-rss.xml');
    const { fetchFn } = makeRecordingFetch([
      { match: (u) => u === 'https://news.example.com/redirect', respond: () => syntheticResponse(302, '', { location: 'https://cdn.example.com/feed.xml' }) },
      { match: (u) => u === 'https://cdn.example.com/feed.xml', respond: () => syntheticResponse(200, xml) },
    ]);
    const result = await runRssCollector({ urls: ['https://news.example.com/redirect'], outDir, fetchFn });
    assert.equal(result.summary.downloaded, 1);
    assert.equal(result.summary.failed, 0);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }

  const outDir2 = await tmpOut();
  try {
    const { fetchFn, requestedUrls } = makeRecordingFetch([
      { match: (u) => u === 'https://news.example.com/redirect', respond: () => syntheticResponse(302, '', { location: 'http://127.0.0.1:9/x' }) },
    ]);
    const { events, reporter } = collectEvents();
    const result = await runRssCollector({ urls: ['https://news.example.com/redirect'], outDir: outDir2, fetchFn, reporter });
    assert.equal(result.summary.failed, 1, '重定向跳私网必须拦截');
    const qErr = events.find((e) => e.type === 'queryError');
    assert.ok(qErr && qErr.type === 'queryError');
    assert.match(qErr.reason, /内网|回环/);
    assert.equal(requestedUrls.filter((u) => u.startsWith('http://127.0.0.1')).length, 0, '不得对私网目标发起请求');
  } finally {
    await rm(outDir2, { recursive: true, force: true });
  }
});

test('rss-collector 编排: 校验期私网 URL 拒绝（RssValidationError，无事件流）', async () => {
  const outDir = await tmpOut();
  try {
    const { events, reporter } = collectEvents();
    await assert.rejects(
      runRssCollector({ urls: ['http://localhost./feed.xml', 'http://10.0.0.5/feed'], outDir, reporter }),
      (err: unknown) => err instanceof RssValidationError && err.errors.length === 2,
    );
    assert.equal(events.length, 0, '校验期失败不得发任何事件（G11）');
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test('rss-collector 编排: 预算公式——重定向不占全局配额、callsMade == Feed 数（KA3）且条目链接零跟随（A12）', async () => {
  const outDir = await tmpOut();
  try {
    const xml = await fixture('normal-rss.xml'); // 条目 link 指向 /posts/101 等
    const { fetchFn, requestedUrls } = makeRecordingFetch([
      { match: (u) => u === 'https://a.example.com/feed', respond: () => syntheticResponse(302, '', { location: 'https://a.example.com/real-feed' }) },
      { match: (u) => u === 'https://a.example.com/real-feed', respond: () => syntheticResponse(200, xml) },
      { match: (u) => u === 'https://b.example.com/feed', respond: () => syntheticResponse(200, xml) },
    ]);
    const result = await runRssCollector({ urls: ['https://a.example.com/feed', 'https://b.example.com/feed'], outDir, fetchFn });
    assert.equal(result.summary.downloaded, 2, '带重定向的 Feed 不应因预算熔断失败');
    assert.equal(result.summary.failed, 0);
    assert.deepEqual(requestedUrls.sort(), [
      'https://a.example.com/feed',
      'https://a.example.com/real-feed',
      'https://b.example.com/feed',
    ].sort());
    assert.equal(requestedUrls.filter((u) => u.includes('/posts/')).length, 0, '条目链接不得被抓取（A12/A20）');
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test('rss-collector 编排: deadline 到点 abort 在途请求并以 done 收尾（KA5/G12）', async () => {
  const outDir = await tmpOut();
  try {
    const { fetchFn } = makeRecordingFetch([
      {
        match: () => true,
        respond: (_url) =>
          new Promise<Response>((_resolve, reject) => {
            // 挂起直到被 abort（模拟无响应 Feed）
            setTimeout(() => reject(new Error('unexpected')), 5000);
          }),
      },
    ]);
    // 注入的 fetchFn 需感知 signal：包装一层
    const signalAwareFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.signal instanceof AbortSignal) {
        return await new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        });
      }
      return (fetchFn as (i: unknown, o?: unknown) => Promise<Response>)(input, init);
    }) as typeof fetch;

    const { events, reporter } = collectEvents();
    const result = await runRssCollector({ urls: [PUBLIC_FEED], outDir, fetchFn: signalAwareFetch, reporter, deadlineMs: 80 });
    assert.equal(result.summary.failed, 1);
    const qErr = events.find((e) => e.type === 'queryError');
    assert.ok(qErr && qErr.type === 'queryError' && qErr.reason === 'DEADLINE_EXCEEDED');
    assert.equal(events[events.length - 1].type, 'done', 'deadline 是软超时：done 收尾而非外层 kill');
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test('rss-collector 编排: manifest 齐备且 verifyDeliveryPackage 核验通过', async () => {
  const outDir = await tmpOut();
  try {
    const xml = await fixture('normal-rss.xml');
    const { fetchFn } = makeRecordingFetch([
      { match: () => true, respond: () => syntheticResponse(200, xml) },
    ]);
    const result = await runRssCollector({ urls: [PUBLIC_FEED], outDir, fetchFn });

    assert.equal(result.manifest.sourceSummary.sourceType, 'rss');
    assert.ok(result.manifest.limitations!.length >= 3);
    assert.deepEqual(result.manifest.operations, [{ backend: 'rss_native_fetch' }]);
    assert.equal(result.manifest.files.snapshotsDir, 'snapshots/');
    assert.ok(result.manifest.schema.fields.length === 8);

    const verification = await verifyDeliveryPackage(outDir);
    assert.ok(verification.valid, `manifest 核验失败: ${verification.mismatches.join('; ')}`);

    // 产物文件齐备
    for (const f of ['records.jsonl', 'evidences.jsonl', 'evidence.sqlite', 'manifest.json']) {
      await fs.access(path.join(outDir, f));
    }
    // 证据可定位（抽查第一条记录的 title 证据）
    const firstEvidence = result.evidences.find((e) => e.field === 'title');
    assert.ok(firstEvidence);
    assert.equal(firstEvidence.confidence, 1.0);
    assert.ok(firstEvidence.charOffsetEnd > firstEvidence.charOffsetStart);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test('rss-collector 编排: limit 每 Feed 截断与截断样本 truncated 标记（G6/G10）', async () => {
  const outDir = await tmpOut();
  try {
    const xml = await fixture('truncated-rss.xml');
    const { fetchFn } = makeRecordingFetch([{ match: () => true, respond: () => syntheticResponse(200, xml) }]);
    const result = await runRssCollector({ urls: [PUBLIC_FEED], outDir, fetchFn, limit: 1 });
    assert.equal(result.summary.matched, 1, 'limit=1 每 Feed 只取第一条');

    const snapDir = path.join(outDir, 'snapshots');
    const [snapId] = await fs.readdir(snapDir);
    const meta = JSON.parse(await fs.readFile(path.join(snapDir, snapId, 'metadata.json'), 'utf8'));
    assert.equal(meta.truncated, true, '截断样本 metadata.truncated 必须如实标记（A07）');

    // G10 第四子句：manifest limitations 注明「Feed 可能截断」
    assert.ok(
      result.manifest.limitations!.some((l) => l.includes('截断')),
      `manifest.limitations 应含截断声明: ${JSON.stringify(result.manifest.limitations)}`,
    );

    // 非截断采集不附加该条目
    const normalXml = await fixture('normal-rss.xml');
    const outDir2 = await tmpOut();
    try {
      const { fetchFn: fn2 } = makeRecordingFetch([{ match: () => true, respond: () => syntheticResponse(200, normalXml) }]);
      const result2 = await runRssCollector({ urls: [PUBLIC_FEED], outDir: outDir2, fetchFn: fn2 });
      assert.ok(!result2.manifest.limitations!.some((l) => l.includes('截断')), '非截断任务不得附加截断声明');
    } finally {
      await rm(outDir2, { recursive: true, force: true });
    }
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test('rss-collector 编排: 本地真实服务器采集（RSS_ALLOW_PRIVATE_ORIGIN=1 豁免，G3）', async (t) => {
  process.env.RSS_ALLOW_PRIVATE_ORIGIN = '1';
  t.after(() => {
    delete process.env.RSS_ALLOW_PRIVATE_ORIGIN;
  });

  const xml = await fixture('atom.xml');
  const server = http.createServer((req, res) => {
    if (req.url === '/atom.xml') {
      res.writeHead(200, { 'content-type': 'application/atom+xml' });
      res.end(xml);
    } else {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;

  const outDir = await tmpOut();
  try {
    const { events, reporter } = collectEvents();
    const result = await runRssCollector({
      urls: [`http://127.0.0.1:${port}/atom.xml`, `http://127.0.0.1:${port}/missing.xml`],
      outDir,
      reporter,
    });
    assert.equal(result.summary.downloaded, 1);
    assert.equal(result.summary.failed, 1);
    assert.equal(result.summary.matched, 2);
    const fileEvents = events.filter((e) => e.type === 'file');
    assert.equal(fileEvents.filter((e) => e.type === 'file' && e.status === 'downloaded').length, 1);
    assert.equal(fileEvents.filter((e) => e.type === 'file' && e.status === 'failed').length, 1);
  } finally {
    await rm(outDir, { recursive: true, force: true });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
