/**
 * 对拍测试：同一批非法输入，爬虫 CLI（真实子进程）与共享校验函数必须一致拒绝。
 * 注意：两边文案不同（CLI 面向命令行、共享函数面向运营），对拍的是「接受/拒绝」的判定，不是文案。
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { listIndustries } from '../../../crawlers/cninfo-reports/src/industries.js';
import { validateTaskParams, type TaskParams } from '../shared/task-params.js';

const crawlerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../crawlers/cninfo-reports');

function cliRejects(argv: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts', ...argv], { cwd: crawlerDir });
    child.on('close', (code) => resolve(code !== 0));
  });
}

const base: TaskParams = { companies: ['平安银行'], industries: [], year: 2024, types: ['annual'], sleepMs: 1000 };

/** 只覆盖「拒绝」用例：合法用例 CLI 会继续走网络查询，不在此测试。 */
const REJECT_CASES: Array<{ label: string; argv: string[]; params: TaskParams }> = [
  { label: '无对象', argv: ['--year', '2024'], params: { ...base, companies: [] } },
  {
    label: '年份与日期范围并存',
    argv: ['-c', '平安银行', '--year', '2024', '--from', '2025-01-01', '--to', '2025-02-01'],
    params: { ...base, from: '2025-01-01', to: '2025-02-01' },
  },
  {
    label: 'from/to 不成对',
    argv: ['-c', '平安银行', '--from', '2025-01-01'],
    params: { ...base, year: undefined, from: '2025-01-01' },
  },
  {
    label: 'from 晚于 to',
    argv: ['-c', '平安银行', '--from', '2025-03-01', '--to', '2025-02-01'],
    params: { ...base, year: undefined, from: '2025-03-01', to: '2025-02-01' },
  },
  { label: 'sleep 低于下限', argv: ['-c', '平安银行', '--year', '2024', '--sleep', '100'], params: { ...base, sleepMs: 100 } },
  { label: 'limit 为 0', argv: ['-c', '平安银行', '--year', '2024', '--limit', '0'], params: { ...base, limit: 0 } },
  { label: '非法报告类型', argv: ['-c', '平安银行', '--year', '2024', '-t', 'yearly'], params: { ...base, types: ['yearly' as never] } },
  { label: '年份越界', argv: ['-c', '平安银行', '--year', '1800'], params: { ...base, year: 1800 } },
];

for (const c of REJECT_CASES) {
  test(`对拍「${c.label}」：CLI 与共享校验一致拒绝`, async () => {
    assert.equal(await cliRejects(c.argv), true, 'CLI 应拒绝');
    assert.ok(validateTaskParams(c.params, listIndustries()).length > 0, '共享校验应拒绝');
  });
}
