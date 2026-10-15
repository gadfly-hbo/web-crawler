/** validateRssParams 校验测试：URL 白名单（任务即白名单）与参数边界（G6）。 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { validateRssParams, type RssTaskParams } from '../src/domain/index.js';

function validParams(overrides: Partial<RssTaskParams> = {}): RssTaskParams {
  return {
    sourceType: 'rss',
    name: '公开资讯采集',
    urls: ['https://news.example.com/feed.xml'],
    ...overrides,
  };
}

test('rss-collector 校验: 合法参数通过', () => {
  assert.deepEqual(validateRssParams(validParams()), []);
  assert.deepEqual(
    validateRssParams(validParams({ urls: Array.from({ length: 5 }, (_, i) => `https://feed${i}.example.com/rss`), limit: 500, deadlineMs: 60000 })),
    [],
  );
});

test('rss-collector 校验: urls 为空、超上限 5、重复均拒绝', () => {
  assert.ok(validateRssParams(validParams({ urls: [] })).length > 0);
  assert.ok(
    validateRssParams(validParams({ urls: Array.from({ length: 6 }, (_, i) => `https://f${i}.example.com/rss`) })).some((e) =>
      e.includes('5'),
    ),
  );
  assert.ok(
    validateRssParams(validParams({ urls: ['https://a.example.com/rss', 'https://a.example.com/rss'] })).some((e) =>
      e.includes('重复'),
    ),
  );
});

test('rss-collector 校验: 私网/回环/尾随点主机名 Feed URL 拒绝（A10）', () => {
  const bad = [
    'http://localhost/feed.xml',
    'http://localhost./feed.xml',
    'http://127.0.0.1:8080/rss',
    'http://192.168.1.10/feed',
    'http://10.0.0.5/feed.xml',
    'ftp://example.com/feed.xml',
    'not-a-url',
  ];
  for (const url of bad) {
    const errors = validateRssParams(validParams({ urls: [url] }));
    assert.ok(errors.length > 0, `应拒绝: ${url}`);
  }
});

test('rss-collector 校验: limit 与 deadlineMs 边界', () => {
  for (const limit of [0, -1, 1.5, 501]) {
    assert.ok(validateRssParams(validParams({ limit: limit as number })).some((e) => e.includes('limit')), `limit=${limit} 应拒绝`);
  }
  for (const deadlineMs of [0, -100, 3.5]) {
    assert.ok(validateRssParams(validParams({ deadlineMs: deadlineMs as number })).some((e) => e.includes('deadlineMs')), `deadlineMs=${deadlineMs} 应拒绝`);
  }
});

test('rss-collector 校验: 任务名称不能为空', () => {
  assert.ok(validateRssParams(validParams({ name: '  ' })).some((e) => e.includes('名称')));
});
