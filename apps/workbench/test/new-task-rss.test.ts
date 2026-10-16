/** WC-AR-06 T1：RSS 场景数据层——getTaskParams rss 分支、场景卡、显式 sourceType 映射（G1/G2/G4/G9/G11）。 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  COLLECTOR_SCENARIOS,
  SCENARIO_SOURCE_TYPES,
} from '../shared/task-params.js';
import { getTaskParams, initialNewTaskState } from '../web/src/views/new-task/reducer.js';
import type { NewTaskState } from '../web/src/views/new-task/types.js';

function rssState(overrides: Partial<NewTaskState> = {}): NewTaskState {
  return {
    ...initialNewTaskState,
    scenario: 'rss',
    sourceType: 'rss',
    rssUrlsText: 'https://a.example.com/feed.xml\n# 注释行\n\nhttps://b.example.com/atom.xml\n',
    rssLimitText: '',
    ...overrides,
  };
}

test('WC-AR-06 getTaskParams rss 分支：换行解析、# 注释与空行忽略、空数组透传不回填', () => {
  const params = getTaskParams(rssState()) as { sourceType: string; name: string; urls: string[]; limit?: number };
  assert.equal(params.sourceType, 'rss');
  assert.equal(params.name, '公开 RSS 资讯采集');
  assert.deepEqual(params.urls, ['https://a.example.com/feed.xml', 'https://b.example.com/atom.xml']);
  assert.equal(params.limit, undefined, 'limit 留空 → undefined（默认 50 由 CLI 承担）');

  // G2：空 urls 透传空数组，由 validateRssParams 报「Feed URL 列表不能为空」——不镜像 product 的样板回填
  const empty = getTaskParams(rssState({ rssUrlsText: '# 全是注释\n\n' })) as { urls: string[] };
  assert.deepEqual(empty.urls, []);
});

test('WC-AR-06 getTaskParams rss 分支：limit 非空 Number 透传（非法值交校验报错，G11）', () => {
  const withLimit = getTaskParams(rssState({ rssLimitText: '20' })) as { limit?: number };
  assert.equal(withLimit.limit, 20);

  const badLimit = getTaskParams(rssState({ rssLimitText: 'abc' })) as { limit?: number };
  assert.ok(Number.isNaN(badLimit.limit), '非法 limit 原样透传，validateRssParams 给中文错误');

  const blankLimit = getTaskParams(rssState({ rssLimitText: '   ' })) as { limit?: number };
  assert.equal(blankLimit.limit, undefined, '纯空白 → undefined');
});

test('WC-AR-06 COLLECTOR_SCENARIOS：rss 卡字段级断言（G4）与卡序第 3 位（G9）', () => {
  const card = COLLECTOR_SCENARIOS.find((s) => s.id === 'rss');
  assert.ok(card, 'rss 场景卡必须存在');
  assert.equal(card.title, '公开 RSS 资讯采集');
  assert.equal(card.badge, '只读 Feed · PoC');
  assert.equal(card.category, 'crawler');
  assert.ok(card.description.includes('任务即白名单、不抓正文'), '描述必含白名单声明（G4 断言对象）');
  assert.equal(COLLECTOR_SCENARIOS[0].id, 'product-price-comparison');
  assert.equal(COLLECTOR_SCENARIOS[1].id, 'cninfo-reports');
  assert.equal(COLLECTOR_SCENARIOS[2].id, 'rss', 'G9：RSS 卡插在财报之后第 3 位');
  assert.equal(COLLECTOR_SCENARIOS[3].id, 'weather-api');
  assert.equal(COLLECTOR_SCENARIOS[4].id, 'custom-request');
});

test('WC-AR-06 SCENARIO_SOURCE_TYPES：显式映射覆盖五场景、rss→rss、custom-request 显式化（G1）', () => {
  assert.equal(SCENARIO_SOURCE_TYPES.rss, 'rss');
  assert.equal(SCENARIO_SOURCE_TYPES['cninfo-reports'], 'cninfo');
  assert.equal(SCENARIO_SOURCE_TYPES['product-price-comparison'], 'web-scraper');
  assert.equal(SCENARIO_SOURCE_TYPES['weather-api'], 'api-connector');
  assert.equal(SCENARIO_SOURCE_TYPES['custom-request'], 'api-connector', '既有隐式回落转显式条目');
  assert.equal(Object.keys(SCENARIO_SOURCE_TYPES).length, 5, 'Record 编译期穷尽 + 运行时五键');
});
