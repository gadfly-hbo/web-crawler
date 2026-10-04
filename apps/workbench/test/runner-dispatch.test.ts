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
