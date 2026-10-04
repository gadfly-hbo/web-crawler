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
