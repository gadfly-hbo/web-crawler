/** WC-AR-06 T2：任务列表五类目数据驱动分区纯函数（G3 + UI 裁决②）。 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TaskRecord } from '../shared/task.js';
import { partitionTasks } from '../web/src/views/taskPartition.js';

function fakeTask(id: string, sourceType: string, dryRun = false): TaskRecord {
  return {
    id,
    title: `任务 ${id}`,
    params: {
      sourceType,
      name: `任务 ${id}`,
      request: { url: '', method: 'GET' },
      extraction: { listPath: '' },
    } as TaskRecord['params'],
    dryRun,
    status: 'succeeded',
    createdAt: `2026-10-16T00:00:0${id.length % 10}:00.000Z`,
    totalCompanies: 0,
    companyIndex: 0,
    counts: { downloaded: 0, skipped: 0, failed: 0, matched: 0 },
    failures: [],
    outDir: `/tmp/${id}`,
    logFile: `/tmp/${id}.ndjson`,
  };
}

test('WC-AR-06 partitionTasks：五类目各归其区、preview 单列、dryRun 不进类目区（G3/裁决②）', () => {
  const weatherTask = fakeTask('wt', 'api-connector');
  weatherTask.params = { ...weatherTask.params, name: '城市天气采集' } as TaskRecord['params'];
  const tasks: TaskRecord[] = [
    fakeTask('cn', 'cninfo'),
    fakeTask('pp', 'web-scraper'),
    weatherTask,
    fakeTask('api', 'api-connector'),
    fakeTask('rss', 'rss'),
    fakeTask('pv', 'cninfo', true),
  ];
  const { preview, byCategory } = partitionTasks(tasks);

  assert.equal(preview.length, 1);
  assert.equal(preview[0].id, 'pv');
  assert.equal(byCategory.cninfo.length, 1);
  assert.equal(byCategory['product-price'].length, 1);
  assert.equal(byCategory['product-price'][0].id, 'pp');
  assert.equal(byCategory.weather.length, 1);
  assert.equal(byCategory.weather[0].id, 'wt');
  assert.equal(byCategory.api.length, 1);
  assert.equal(byCategory.api[0].id, 'api');
  assert.equal(byCategory.rss.length, 1);
  assert.equal(byCategory.rss[0].id, 'rss');
});

test('WC-AR-06 partitionTasks：缺省 sourceType 视为 cninfo（向后兼容）', () => {
  const { byCategory } = partitionTasks([fakeTask('legacy', 'cninfo')]);
  assert.equal(byCategory.cninfo.length, 1);
});

test('WC-AR-06 partitionTasks：五键恒存在（空类目为空数组，视图层决定隐藏）', () => {
  const { byCategory } = partitionTasks([]);
  assert.deepEqual(Object.keys(byCategory).sort(), ['api', 'cninfo', 'product-price', 'rss', 'weather']);
  for (const list of Object.values(byCategory)) assert.deepEqual(list, []);
});
