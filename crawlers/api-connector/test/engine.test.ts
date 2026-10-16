import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { runApiConnector } from '../src/engine.js';
import type { CrawlEvent } from '../src/events.js';
import type { ApiConnectorParams } from '../src/domain/index.js';

function createMockParams(overrides: Partial<ApiConnectorParams> = {}): ApiConnectorParams {
  return {
    sourceType: 'api-connector',
    name: '示例研报接口',
    request: {
      url: 'https://api.example.com/reports?page={{page}}&size={{pageSize}}',
      method: 'GET',
    },
    pagination: {
      type: 'page_number',
      pageParam: 'page',
      pageSizeParam: 'size',
      startPage: 1,
      pageSize: 2,
      maxPages: 5,
    },
    extraction: {
      listPath: 'data.items',
      titlePath: 'title',
      itemKeyPath: 'id',
      downloadUrlPath: 'pdfUrl',
      datePath: 'date',
    },
    sleepMs: 0,
    ...overrides,
  };
}

test('runApiConnector: 正常分页与附件下载流程', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'api-engine-test-'));
  const events: CrawlEvent[] = [];

  const mockFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes('page=1')) {
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            items: [
              { id: '101', title: '宏观分析报告', date: '2026-01-01', pdfUrl: 'https://cdn.example.com/101.pdf' },
              { id: '102', title: '行业投资策略', date: '2026-01-02', pdfUrl: 'https://cdn.example.com/102.pdf' },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.includes('page=2')) {
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            items: [
              { id: '103', title: '科技行业周报', date: '2026-01-03', pdfUrl: 'https://cdn.example.com/103.pdf' },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.endsWith('.pdf')) {
      return new Response(Buffer.from(`mock pdf content for ${url}`), {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
      });
    }
    return new Response('Not found', { status: 404 });
  };

  try {
    const summary = await runApiConnector({
      params: createMockParams(),
      reporter: (e) => events.push(e),
      outDir: tmp,
      dryRun: false,
      fetchFn: mockFetch,
    });

    assert.equal(summary.matched, 3);
    assert.equal(summary.downloaded, 3);
    assert.equal(summary.failed, 0);
    assert.equal(summary.skipped, 0);

    const types = events.map((e) => e.type);
    assert.ok(types.includes('start'));
    assert.ok(types.includes('company'));
    assert.ok(types.includes('done'));
    const fileEvents = events.filter((e) => e.type === 'file');
    assert.equal(fileEvents.length, 3);

    const indexContent = await readFile(path.join(tmp, 'index.jsonl'), 'utf8');
    assert.ok(indexContent.includes('宏观分析报告'));
    assert.ok(indexContent.includes('科技行业周报'));

    // 递延收敛批：manifest 携带限制声明（有附件落盘即生成 manifest）
    const manifest = JSON.parse(await readFile(path.join(tmp, 'manifest.json'), 'utf8'));
    assert.ok(Array.isArray(manifest.limitations) && manifest.limitations.length > 0);
    assert.ok(manifest.limitations.some((l: string) => l.includes('不推断')));

    // 第二遍执行对同一批文件发出 skipped 事件
    const secondEvents: CrawlEvent[] = [];
    const secondSummary = await runApiConnector({
      params: createMockParams(),
      reporter: (e) => secondEvents.push(e),
      outDir: tmp,
      dryRun: false,
      fetchFn: mockFetch,
    });
    assert.equal(secondSummary.skipped, 3);
    assert.equal(secondSummary.downloaded, 0);
    const skippedFiles = secondEvents.filter((e) => e.type === 'file' && e.status === 'skipped');
    assert.equal(skippedFiles.length, 3);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('runApiConnector: dryRun 模式仅发出 preview 事件且不写文件', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'api-engine-dryrun-'));
  const events: CrawlEvent[] = [];

  const mockFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes('page=1')) {
      return new Response(
        JSON.stringify({
          data: {
            items: [
              { id: '1', title: '报告 1', pdfUrl: 'https://cdn.example.com/1.pdf' },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({ data: { items: [] } }), { status: 200 });
  };

  try {
    const summary = await runApiConnector({
      params: createMockParams(),
      reporter: (e) => events.push(e),
      outDir: tmp,
      dryRun: true,
      fetchFn: mockFetch,
    });

    assert.equal(summary.matched, 1);
    assert.equal(summary.downloaded, 0);

    const preview = events.find((e) => e.type === 'preview');
    assert.ok(preview);
    if (preview && preview.type === 'preview') {
      assert.equal(preview.reports, 1);
      assert.equal(preview.companies, 1);
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('runApiConnector: 单文件下载失败不中断整体流程，且清理 .part', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'api-engine-fail-'));
  const events: CrawlEvent[] = [];

  const mockFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes('page=1')) {
      return new Response(
        JSON.stringify({
          data: {
            items: [
              { id: 'ok1', title: '成功报告 1', pdfUrl: 'https://cdn.example.com/ok1.pdf' },
              { id: 'fail2', title: '损坏报告 2', pdfUrl: 'https://cdn.example.com/fail2.pdf' },
              { id: 'ok3', title: '成功报告 3', pdfUrl: 'https://cdn.example.com/ok3.pdf' },
            ],
          },
        }),
        { status: 200 },
      );
    }
    if (url.includes('fail2.pdf')) {
      return new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' });
    }
    if (url.endsWith('.pdf')) {
      return new Response(Buffer.from('pdf data'), { status: 200 });
    }
    return new Response(JSON.stringify({ data: { items: [] } }), { status: 200 });
  };

  try {
    const summary = await runApiConnector({
      params: createMockParams(),
      reporter: (e) => events.push(e),
      outDir: tmp,
      dryRun: false,
      fetchFn: mockFetch,
    });

    assert.equal(summary.downloaded, 2);
    assert.equal(summary.failed, 1);

    const failedEvent = events.find((e) => e.type === 'file' && e.status === 'failed');
    assert.ok(failedEvent);
    if (failedEvent && failedEvent.type === 'file') {
      assert.equal(failedEvent.title, '损坏报告 2');
      assert.ok(failedEvent.reason?.includes('500'));
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('runApiConnector: maxPages 熔断保护防止无限翻页', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'api-engine-maxpages-'));
  let pageRequests = 0;

  const mockFetch: typeof fetch = async () => {
    pageRequests++;
    return new Response(
      JSON.stringify({
        data: {
          items: [{ id: String(pageRequests), title: `Item ${pageRequests}`, pdfUrl: 'https://example.com/file.pdf' }],
        },
      }),
      { status: 200 },
    );
  };

  try {
    const summary = await runApiConnector({
      params: createMockParams({
        pagination: {
          type: 'page_number',
          pageParam: 'page',
          startPage: 1,
          pageSize: 1,
          maxPages: 3,
        },
      }),
      reporter: () => {},
      outDir: tmp,
      dryRun: true,
      fetchFn: mockFetch,
    });

    assert.equal(pageRequests, 3);
    assert.equal(summary.matched, 3);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('runApiConnector: 接口返回 HTTP 500 时发射 queryError 并计入失败', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'api-engine-queryerr-'));
  const events: CrawlEvent[] = [];

  const mockFetch: typeof fetch = async () => {
    return new Response('Gateway Error', { status: 502, statusText: 'Bad Gateway' });
  };

  try {
    const summary = await runApiConnector({
      params: createMockParams(),
      reporter: (e) => events.push(e),
      outDir: tmp,
      dryRun: false,
      fetchFn: mockFetch,
    });

    assert.equal(summary.failed, 1);
    const queryErr = events.find((e) => e.type === 'queryError');
    assert.ok(queryErr);
    if (queryErr && queryErr.type === 'queryError') {
      assert.ok(queryErr.reason.includes('502'));
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('runApiConnector: 分页请求 302 跳转私网被出口门禁拦截', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'api-engine-redirect-'));
  const events: CrawlEvent[] = [];
  const mockFetch: typeof fetch = async () =>
    new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/internal' } });

  try {
    const summary = await runApiConnector({
      params: createMockParams(),
      reporter: (e) => events.push(e),
      outDir: tmp,
      fetchFn: mockFetch,
    });
    assert.ok(summary.failed >= 1);
    const qerr = events.find((e) => e.type === 'queryError');
    assert.ok(qerr && qerr.type === 'queryError');
    assert.match(qerr.reason, /内网|回环/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('runApiConnector: downloadUrl 直指私网（无重定向）被拦', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'api-engine-dlurl-'));
  const events: CrawlEvent[] = [];
  const mockFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes('api.example.com')) {
      return new Response(
        JSON.stringify({
          data: {
            items: [{ id: '1', title: '恶意条目', pdfUrl: 'http://169.254.169.254/latest/meta-data' }],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('不应被请求', { status: 200 });
  };

  try {
    await runApiConnector({
      params: createMockParams(),
      reporter: (e) => events.push(e),
      outDir: tmp,
      fetchFn: mockFetch,
    });
    const fileEvent = events.find((e) => e.type === 'file' && e.status === 'failed');
    assert.ok(fileEvent && fileEvent.type === 'file');
    assert.match(fileEvent.reason ?? '', /内网|回环/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('runApiConnector: 公网 303 重定向逐跳跟随且改写为 GET', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'api-engine-303-'));
  const events: CrawlEvent[] = [];
  const seenMethods: string[] = [];
  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    seenMethods.push(init?.method ?? 'GET');
    if (url.includes('api.example.com')) {
      return new Response(null, { status: 303, headers: { Location: 'https://cdn.example.com/final' } });
    }
    return new Response(JSON.stringify({ data: { items: [] } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const params = createMockParams({
    request: { url: 'https://api.example.com/reports', method: 'POST', bodyTemplate: '{"page": {{page}}}' },
  });

  try {
    await runApiConnector({
      params,
      reporter: (e) => events.push(e),
      outDir: tmp,
      fetchFn: mockFetch,
    });
    assert.deepEqual(seenMethods, ['POST', 'GET']);
    assert.ok(events.some((e) => e.type === 'done'));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

// ===== 递延收敛批 T1：N2 预算分池（红队探针 A/B2/C + G5/G7） =====

test('N2 recheck: maxPages=2 单页 10 附件全部下载成功、matched=20 无静默少收', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'api-n2-recheck-'));
  const events: CrawlEvent[] = [];
  const items = (page: number) =>
    Array.from({ length: 10 }, (_, i) => {
      const id = `${page}${String(i + 1).padStart(2, '0')}`;
      return { id, title: `报告 ${id}`, date: '2026-01-01', pdfUrl: `https://cdn.example.com/${id}.pdf` };
    });
  const mockFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes('page=1')) {
      return new Response(JSON.stringify({ code: 0, data: { items: items(1) } }), { status: 200 });
    }
    if (url.includes('page=2')) {
      return new Response(JSON.stringify({ code: 0, data: { items: items(2) } }), { status: 200 });
    }
    return new Response(Buffer.from('pdf'), { status: 200, headers: { 'Content-Type': 'application/pdf' } });
  };
  const summary = await runApiConnector({
    params: createMockParams({ pagination: { type: 'page_number', pageParam: 'page', pageSizeParam: 'size', startPage: 1, pageSize: 10, maxPages: 2 } }),
    reporter: (e) => events.push(e),
    outDir: tmp,
    fetchFn: mockFetch,
  });
  assert.equal(summary.matched, 20, '两页条目应全部计数（探针 A 的 matched=10 静默少收反例）');
  assert.equal(summary.downloaded, 20, '20 个附件应全部下载（探针 A 的 6/20 反例）');
  assert.equal(summary.failed, 0);
  assert.ok(!events.some((e) => e.type === 'queryError'), `不得有预算熔断，实际：${JSON.stringify(events.filter((e) => e.type === 'queryError'))}`);
  await rm(tmp, { recursive: true, force: true });
});

test('N2: 重定向密集分页（每页 1+5 跳）不熔断（探针 B2 反例）', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'api-n2-redirect-'));
  const events: CrawlEvent[] = [];
  const fullPage = (size: number) =>
    Array.from({ length: size }, (_, i) => ({ id: `p${i}`, title: `t${i}`, date: '2026-01-01' }));
  const mockFetch: typeof fetch = async (input) => {
    const url = String(input);
    const hop = Number(new URL(url).searchParams.get('hop') ?? '0');
    if (hop < 5) {
      return new Response('', { status: 302, headers: { location: `${url.split('&hop=')[0]}&hop=${hop + 1}` } });
    }
    return new Response(JSON.stringify({ code: 0, data: { items: fullPage(5) } }), { status: 200 });
  };
  const summary = await runApiConnector({
    params: createMockParams({ pagination: { type: 'page_number', pageParam: 'page', pageSizeParam: 'size', startPage: 1, pageSize: 5, maxPages: 3 } }),
    reporter: (e) => events.push(e),
    outDir: tmp,
    dryRun: true,
    fetchFn: mockFetch,
  });
  assert.equal(summary.failed, 0, `重定向密集分页不得熔断，实际 queryError：${JSON.stringify(events.filter((e) => e.type === 'queryError'))}`);
  await rm(tmp, { recursive: true, force: true });
});

test('N2: >500 总跳不触发 TOKENS_EXCEEDED（条件 1 佐证，探针 C 反例）', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'api-n2-500-'));
  const events: CrawlEvent[] = [];
  const fullPage = (size: number) =>
    Array.from({ length: size }, (_, i) => ({ id: `p${i}`, title: `t${i}`, date: '2026-01-01' }));
  const mockFetch: typeof fetch = async (input) => {
    const url = String(input);
    const hop = Number(new URL(url).searchParams.get('hop') ?? '0');
    if (hop < 5) {
      return new Response('', { status: 302, headers: { location: `${url.split('&hop=')[0]}&hop=${hop + 1}` } });
    }
    return new Response(JSON.stringify({ code: 0, data: { items: fullPage(5) } }), { status: 200 });
  };
  const summary = await runApiConnector({
    params: createMockParams({ pagination: { type: 'page_number', pageParam: 'page', pageSizeParam: 'size', startPage: 1, pageSize: 5, maxPages: 100 } }),
    reporter: (e) => events.push(e),
    outDir: tmp,
    dryRun: true,
    fetchFn: mockFetch,
  });
  assert.equal(summary.failed, 0, `600 跳全过不得熔断，实际：${JSON.stringify(events.filter((e) => e.type === 'queryError'))}`);
  assert.ok(!events.some((e) => e.type === 'queryError' && String((e as { reason?: string }).reason).includes('TOKENS_EXCEEDED')));
  await rm(tmp, { recursive: true, force: true });
});

test('N2: budgets 注入小池确定性熔断——queryError + [BudgetGate] reason + summary.failed（G5 全链路）', async () => {
  const { BudgetGate } = await import('data-governance/budget');
  const tmp = await mkdtemp(path.join(tmpdir(), 'api-n2-pool-'));
  const events: CrawlEvent[] = [];
  const mockFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes('page=1')) {
      return new Response(JSON.stringify({ code: 0, data: { items: [{ id: '1', title: 't', date: 'd', pdfUrl: 'https://cdn.example.com/1.pdf' }] } }), { status: 200 });
    }
    return new Response(Buffer.from('pdf'), { status: 200 });
  };
  const summary = await runApiConnector({
    params: createMockParams({ pagination: { type: 'page_number', pageParam: 'page', pageSizeParam: 'size', startPage: 1, pageSize: 1, maxPages: 2 } }),
    reporter: (e) => events.push(e),
    outDir: tmp,
    fetchFn: mockFetch,
    budgets: {
      pagination: new BudgetGate({ maxCalls: 1, maxTokens: undefined, maxCostUsd: undefined }),
      download: new BudgetGate({ maxCalls: 1, maxTokens: undefined, maxCostUsd: undefined }),
    },
  });
  const qErrs = events.filter((e) => e.type === 'queryError');
  assert.ok(qErrs.length >= 1, `分页第 2 页应因小池熔断，实际事件：${JSON.stringify(events)}`);
  assert.match(String((qErrs[0] as { reason?: string }).reason), /\[BudgetGate\]/);
  assert.ok(summary.failed >= 1, '熔断应计入 failed');
  await rm(tmp, { recursive: true, force: true });
});
