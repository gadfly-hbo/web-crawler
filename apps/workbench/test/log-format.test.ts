/** formatLogLine 行为测试。 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatLogLine } from '../shared/log-format.js';

test('各事件类型转人读文案', () => {
  assert.equal(
    formatLogLine(JSON.stringify({ type: 'start', totalCompanies: 3, dryRun: false })),
    '开始：共 3 家公司待处理',
  );
  assert.equal(
    formatLogLine(JSON.stringify({ type: 'company', index: 2, total: 3, code: '000001', name: '平安银行' })),
    '[2/3] 平安银行（000001）',
  );
  assert.equal(
    formatLogLine(JSON.stringify({ type: 'file', status: 'downloaded', name: '平安银行', title: '2024年年度报告', bytes: 2097152 })),
    '↓ 已下载 平安银行 2024年年度报告（2.0MB）',
  );
  assert.equal(
    formatLogLine(JSON.stringify({ type: 'file', status: 'skipped', name: '平安银行', title: 't' })),
    '＝ 已存在，跳过 平安银行 t',
  );
  assert.equal(
    formatLogLine(JSON.stringify({ type: 'file', status: 'failed', name: '平安银行', reason: '连接超时' })),
    '✗ 下载失败 平安银行：连接超时',
  );
  assert.equal(
    formatLogLine(JSON.stringify({ type: 'queryError', target: '金融业', reason: 'HTTP 400' })),
    '✗ 检索失败 金融业：HTTP 400',
  );
  assert.equal(
    formatLogLine(JSON.stringify({ type: 'preview', companies: 1434, reports: 1452 })),
    '预览结果：1434 家公司、1452 份报告',
  );
  assert.equal(
    formatLogLine(JSON.stringify({ type: 'done', summary: { downloaded: 5, skipped: 2, failed: 1 } })),
    '完成：新下载 5 份、跳过 2 份、失败 1 处',
  );
  assert.equal(formatLogLine(JSON.stringify({ type: 'error', message: '必须指定时间' })), '错误：必须指定时间');
});

test('非 JSON 行与未知事件原样透传', () => {
  assert.equal(formatLogLine('plain text line'), 'plain text line');
  assert.equal(formatLogLine(JSON.stringify({ type: 'unknown-x', v: 1 })), '{"type":"unknown-x","v":1}');
});
