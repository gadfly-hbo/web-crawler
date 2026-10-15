import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

import { buildCrawlerSpawnSpec } from '../server/runner.js';
import type { ApiConnectorParams, CninfoTaskParams } from '../shared/task-params.js';

const dummyRepoRoot = '/workspace/test-repo';

test('buildCrawlerSpawnSpec: 缺省 sourceType 兼容识别为 cninfo 并构建对应子进程参数', () => {
  const cninfoParams: CninfoTaskParams = {
    companies: ['平安银行'],
    industries: [],
    year: 2024,
    types: ['annual'],
    sleepMs: 1000,
  };

  const spec = buildCrawlerSpawnSpec(
    {
      params: cninfoParams,
      dryRun: false,
      outDir: '/data/out-1',
    },
    dummyRepoRoot,
  );

  assert.equal(spec.cwd, path.join(dummyRepoRoot, 'crawlers', 'cninfo-reports'));
  assert.ok(spec.args.includes(path.join(dummyRepoRoot, 'crawlers', 'cninfo-reports', 'src', 'main.ts')));
  assert.ok(spec.args.includes('--json'));
  assert.ok(spec.args.includes('--company'));
  assert.ok(spec.args.includes('平安银行'));
  assert.ok(spec.args.includes('-o'));
  assert.ok(spec.args.includes('/data/out-1'));
});

test('buildCrawlerSpawnSpec: api-connector 分发到 api-connector 爬虫并序列化配置', () => {
  const apiParams: ApiConnectorParams = {
    sourceType: 'api-connector',
    name: '研报接口',
    request: {
      url: 'https://api.example.com/reports',
      method: 'GET',
    },
    pagination: {
      type: 'page_number',
      pageParam: 'page',
      startPage: 1,
      pageSize: 20,
    },
    extraction: {
      listPath: 'data.items',
      titlePath: 'title',
    },
    sleepMs: 500,
  };

  const spec = buildCrawlerSpawnSpec(
    {
      params: apiParams,
      dryRun: true,
      outDir: '/data/out-api',
    },
    dummyRepoRoot,
  );

  assert.equal(spec.cwd, path.join(dummyRepoRoot, 'crawlers', 'api-connector'));
  assert.ok(spec.args.includes(path.join(dummyRepoRoot, 'crawlers', 'api-connector', 'src', 'main.ts')));
  assert.ok(spec.args.includes('--config-json'));
  assert.ok(spec.args.includes('--dry-run'));
  assert.ok(spec.args.includes('/data/out-api'));

  const jsonIndex = spec.args.indexOf('--config-json') + 1;
  const parsed = JSON.parse(spec.args[jsonIndex]);
  assert.equal(parsed.name, '研报接口');
  assert.equal(parsed.sourceType, 'api-connector');
});

test('buildCrawlerSpawnSpec: web-scraper 分发到 firecrawl-scraper 爬虫并带参数', () => {
  const webParams = {
    sourceType: 'web-scraper' as const,
    name: '商品价格对比',
    urls: ['https://brand-a.example/1', 'https://brand-b.example/2'],
    mock: true,
    analyze: true,
    baselineBrand: 'Brand A',
  };

  const spec = buildCrawlerSpawnSpec(
    {
      params: webParams,
      dryRun: false,
      outDir: '/data/out-web',
    },
    dummyRepoRoot,
  );

  assert.equal(spec.cwd, path.join(dummyRepoRoot, 'crawlers', 'firecrawl-scraper'));
  assert.ok(spec.args.includes(path.join(dummyRepoRoot, 'crawlers', 'firecrawl-scraper', 'src', 'main.ts')));
  assert.ok(spec.args.includes('--json'));
  assert.ok(spec.args.includes('--urls'));
  assert.ok(spec.args.includes('https://brand-a.example/1,https://brand-b.example/2'));
  assert.ok(spec.args.includes('--mock'));
  assert.ok(spec.args.includes('--analyze'));
  assert.ok(spec.args.includes('--baseline'));
  assert.ok(spec.args.includes('Brand A'));
  assert.ok(spec.args.includes('/data/out-web'));
});

test('buildCrawlerSpawnSpec: web-scraper 凭据仅经 env 注入，argv 不含密钥明文', () => {
  const webParams = {
    sourceType: 'web-scraper' as const,
    name: '云端商品抓取',
    urls: ['https://shop.example/1'],
    mock: false,
    apiKey: 'fc-test-key-123456',
    baseUrl: 'https://custom-firecrawl.example',
  };

  const spec = buildCrawlerSpawnSpec(
    {
      params: webParams,
      dryRun: false,
      outDir: '/data/out-real',
    },
    dummyRepoRoot,
  );

  assert.ok(!spec.args.includes('--mock'), '真实模式不应包含 --mock');
  assert.ok(!spec.args.includes('--api-key'), 'argv 不得携带 --api-key');
  assert.ok(!spec.args.includes('fc-test-key-123456'), 'argv 不得含密钥明文');
  assert.ok(spec.args.includes('--base-url'));
  assert.ok(spec.args.includes('https://custom-firecrawl.example'));
  assert.equal(spec.env?.FIRECRAWL_API_KEY, 'fc-test-key-123456');
  assert.equal(spec.env?.FIRECRAWL_BASE_URL, 'https://custom-firecrawl.example');
});

test('buildCrawlerSpawnSpec: 未知 sourceType 抛出友好异常', () => {
  assert.throws(
    () =>
      buildCrawlerSpawnSpec(
        {
          params: { sourceType: 'unsupported' as never } as never,
          dryRun: false,
          outDir: '/data/test',
        },
        dummyRepoRoot,
      ),
    /不支持的数据源类型: unsupported/,
  );
});


test('buildCrawlerSpawnSpec: rss 分发到 rss-collector 爬虫，argv 无凭据、--urls 逗号透传', () => {
  const spec = buildCrawlerSpawnSpec(
    {
      params: {
        sourceType: 'rss',
        name: '公开资讯',
        urls: ['https://a.example.com/feed.xml', 'https://b.example.com/atom.xml'],
        limit: 20,
        deadlineMs: 30000,
      },
      dryRun: false,
      outDir: path.join(dummyRepoRoot, 'out', 't1'),
    },
    dummyRepoRoot,
  );
  assert.equal(spec.command, process.execPath);
  assert.equal(spec.cwd, path.join(dummyRepoRoot, 'crawlers', 'rss-collector'));
  const entry = path.join(spec.cwd, 'src', 'main.ts');
  const argStr = spec.args.join(' ');
  assert.ok(spec.args.includes('--import'));
  assert.ok(spec.args.includes(entry));
  assert.ok(spec.args.includes('--json'), '工作台消费 NDJSON 事件流');
  const urlsIdx = spec.args.indexOf('--urls');
  assert.equal(spec.args[urlsIdx + 1], 'https://a.example.com/feed.xml,https://b.example.com/atom.xml');
  const limitIdx = spec.args.indexOf('--limit');
  assert.equal(spec.args[limitIdx + 1], '20');
  const deadlineIdx = spec.args.indexOf('--deadline-ms');
  assert.equal(spec.args[deadlineIdx + 1], '30000');
  assert.ok(spec.args.includes('-o'));
  assert.equal(spec.env, undefined, 'rss 无凭据，不注入任何 env');
  assert.ok(!argStr.includes('--api-key'), 'argv 不得出现密钥参数');
});

test('buildCrawlerSpawnSpec: rss 未设置 limit/deadlineMs 时不传对应旗标', () => {
  const spec = buildCrawlerSpawnSpec(
    {
      params: { sourceType: 'rss', name: 'x', urls: ['https://a.example.com/f'] },
      dryRun: false,
      outDir: path.join(dummyRepoRoot, 'out', 't2'),
    },
    dummyRepoRoot,
  );
  assert.ok(!spec.args.includes('--limit'));
  assert.ok(!spec.args.includes('--deadline-ms'));
});
