/** applyEvent 与 classifyDone 状态迁移单测。 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { CrawlEvent } from 'cninfo-reports/events';
import { applyEvent, classifyDone } from '../server/reducer.js';
import type { TaskRecord } from '../shared/task.js';

function makeBaseTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 't-1',
    title: '测试任务',
    params: {
      companies: ['平安银行'],
      industries: [],
      year: 2024,
      types: ['annual'],
      sleepMs: 1000,
    },
    dryRun: false,
    status: 'running',
    createdAt: '2026-10-04T12:00:00.000Z',
    totalCompanies: 0,
    companyIndex: 0,
    counts: { downloaded: 0, skipped: 0, failed: 0, matched: 0 },
    failures: [],
    outDir: '/tmp/test',
    logFile: '/tmp/test/task.log',
    ...overrides,
  };
}

test('classifyDone 分类规则', () => {
  // failed === 0 → succeeded
  assert.equal(classifyDone({ dryRun: false }, { failed: 0, downloaded: 1, skipped: 0 }), 'succeeded');
  // failed > 0，有下载或跳过 → partial
  assert.equal(classifyDone({ dryRun: false }, { failed: 1, downloaded: 1, skipped: 0 }), 'partial');
  assert.equal(classifyDone({ dryRun: false }, { failed: 1, downloaded: 0, skipped: 1 }), 'partial');
  // failed > 0，零产出 → failed
  assert.equal(classifyDone({ dryRun: false }, { failed: 1, downloaded: 0, skipped: 0 }), 'failed');

  // dryRun 模式：有匹配项即算有产出
  assert.equal(classifyDone({ dryRun: true }, { failed: 1, matched: 5 }), 'partial');
  assert.equal(classifyDone({ dryRun: true }, { failed: 1, matched: 0 }), 'failed');
});

test('applyEvent: start 事件更新 totalCompanies', () => {
  const task = makeBaseTask();
  const next = applyEvent(task, { type: 'start', totalCompanies: 10, dryRun: false });
  assert.equal(next.totalCompanies, 10);
  assert.equal(task.totalCompanies, 0, '原任务对象不可变');
});

test('applyEvent: company 事件更新当前公司序号与名称', () => {
  const task = makeBaseTask();
  const next = applyEvent(task, {
    type: 'company',
    index: 3,
    total: 10,
    code: '000001',
    name: '平安银行',
  });
  assert.equal(next.companyIndex, 3);
  assert.equal(next.currentCompany, '平安银行');
});

test('applyEvent: file 事件正确累加 downloaded / skipped / failed 与 title', () => {
  let task = makeBaseTask();
  task = applyEvent(task, {
    type: 'file',
    status: 'downloaded',
    code: '000001',
    name: '平安银行',
    title: '年报',
  });
  assert.equal(task.counts.downloaded, 1);

  task = applyEvent(task, {
    type: 'file',
    status: 'skipped',
    code: '000001',
    name: '平安银行',
    title: '年报',
  });
  assert.equal(task.counts.skipped, 1);

  task = applyEvent(task, {
    type: 'file',
    status: 'failed',
    code: '000001',
    name: '平安银行',
    title: '2024年报',
    reason: '网络断开',
  });
  assert.equal(task.counts.failed, 1);
  assert.deepEqual(task.failures, [
    { code: '000001', name: '平安银行', title: '2024年报', reason: '网络断开' },
  ]);
});

test('applyEvent: queryError 事件记录失败目标并增加 failed 计数', () => {
  const task = makeBaseTask();
  const next = applyEvent(task, { type: 'queryError', target: '金融业', reason: 'HTTP 400' });
  assert.equal(next.counts.failed, 1);
  assert.deepEqual(next.failures, [{ target: '金融业', reason: 'HTTP 400' }]);
});

test('applyEvent: preview 事件记录预览公司与报告数量', () => {
  const task = makeBaseTask({ dryRun: true });
  const next = applyEvent(task, { type: 'preview', companies: 5, reports: 12 });
  assert.deepEqual(next.preview, { companies: 5, reports: 12 });
});

test('applyEvent: done 事件根据结果计算终态', () => {
  const task = makeBaseTask();
  const next = applyEvent(task, {
    type: 'done',
    summary: {
      companies: 1,
      matched: 2,
      downloaded: 2,
      skipped: 0,
      bytes: 1024,
      failed: 0,
      outDir: '/tmp',
    },
  });
  assert.equal(next.status, 'succeeded');
  assert.equal(next.counts.matched, 2);
  assert.ok(next.finishedAt);
});

test('applyEvent: error 事件将 running/queued 任务标记为 failed', () => {
  const task = makeBaseTask({ status: 'running' });
  const next = applyEvent(task, { type: 'error', message: 'fatal crash' });
  assert.equal(next.status, 'failed');
  assert.equal(next.error, 'fatal crash');
  assert.ok(next.finishedAt);
});

test('applyEvent: 遇到未知或进度事件返回原对象引用', () => {
  const task = makeBaseTask();
  const next = applyEvent(task, { type: 'resolvingStocks' } as unknown as CrawlEvent);
  assert.equal(next, task);
});
