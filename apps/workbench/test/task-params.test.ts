/** TaskParams 校验/参数映射/摘要名的行为测试（与 cninfo-reports CLI validate 规则对拍）。 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_SLEEP_MS,
  MIN_SLEEP_MS,
  paramsToCliArgs,
  summarizeTask,
  validateTaskParams,
  type CninfoTaskParams,
  type TaskParams,
} from '../shared/task-params.js';

const INDUSTRIES = ['金融业', '制造业'] as const;

function base(): CninfoTaskParams {
  return {
    companies: ['平安银行'],
    industries: [],
    year: 2024,
    types: ['annual', 'semi', 'q1', 'q3'],
    sleepMs: DEFAULT_SLEEP_MS,
  };
}

test('合法参数通过校验', () => {
  assert.deepEqual(validateTaskParams(base(), INDUSTRIES), []);
});

test('schemaVersion：缺省/任意非空字符串/未知值放行，空串与非字符串拒绝', () => {
  // 缺省合法（旧任务不写也不要求写入）
  assert.deepEqual(validateTaskParams(base(), INDUSTRIES), []);
  // 任意非空字符串放行，未知值不拒绝
  assert.deepEqual(validateTaskParams({ ...base(), schemaVersion: '1.0' }, INDUSTRIES), []);
  assert.deepEqual(validateTaskParams({ ...base(), schemaVersion: '9.9-beta' }, INDUSTRIES), []);
  // 空串与非字符串拒绝
  assert.ok(
    validateTaskParams({ ...base(), schemaVersion: '  ' }, INDUSTRIES).includes(
      'schemaVersion 必须为非空字符串',
    ),
  );
  assert.ok(
    validateTaskParams({ ...base(), schemaVersion: 1 as never }, INDUSTRIES).includes(
      'schemaVersion 必须为非空字符串',
    ),
  );
});

test('timeoutMs：缺省与正整数放行，非正整数拒绝', () => {
  assert.deepEqual(validateTaskParams(base(), INDUSTRIES), []);
  assert.deepEqual(validateTaskParams({ ...base(), timeoutMs: 60_000 }, INDUSTRIES), []);
  assert.ok(
    validateTaskParams({ ...base(), timeoutMs: 0 }, INDUSTRIES).includes('timeoutMs 应为正整数（毫秒）'),
  );
  assert.ok(
    validateTaskParams({ ...base(), timeoutMs: 1.5 }, INDUSTRIES).includes('timeoutMs 应为正整数（毫秒）'),
  );
});

test('公司与行业至少其一', () => {
  const p = { ...base(), companies: [], industries: [] };
  assert.deepEqual(validateTaskParams(p, INDUSTRIES), ['必须至少选择一个公司或一个行业']);
});

test('年份与日期范围互斥，且必须二选一', () => {
  assert.ok(
    validateTaskParams({ ...base(), year: 2024, from: '2025-01-01', to: '2025-02-01' }, INDUSTRIES).includes(
      '报告年份与公告日期范围只能二选一',
    ),
  );
  const noTime = { ...base() };
  delete noTime.year;
  assert.ok(validateTaskParams(noTime, INDUSTRIES).includes('必须指定时间：报告年份或公告日期范围'));
});

test('日期范围需成对、合法、先后顺序正确', () => {
  const onlyFrom = { ...base() };
  delete onlyFrom.year;
  onlyFrom.from = '2025-01-01';
  assert.ok(validateTaskParams(onlyFrom, INDUSTRIES).includes('公告日期的起止需成对填写'));

  const badFmt = { ...base(), year: undefined, from: '2025/01/01', to: '2025-02-01' } as TaskParams;
  assert.ok(validateTaskParams(badFmt, INDUSTRIES).includes('开始日期格式应为 YYYY-MM-DD'));

  const reversed = { ...base(), year: undefined, from: '2025-03-01', to: '2025-02-01' } as TaskParams;
  assert.ok(validateTaskParams(reversed, INDUSTRIES).includes('开始日期不能晚于结束日期'));
});

test('请求间隔不得低于下限，limit 需为正整数', () => {
  assert.ok(
    validateTaskParams({ ...base(), sleepMs: MIN_SLEEP_MS - 1 }, INDUSTRIES).some((e) =>
      e.includes(`不能低于 ${MIN_SLEEP_MS}ms`),
    ),
  );
  assert.ok(
    validateTaskParams({ ...base(), limit: 0 }, INDUSTRIES).includes('最多公司数应为正整数'),
  );
});

test('报告类型必须非空且取值合法，行业必须在门类清单内', () => {
  assert.ok(validateTaskParams({ ...base(), types: [] }, INDUSTRIES).includes('请至少选择一种报告类型'));
  assert.ok(
    validateTaskParams({ ...base(), types: ['yearly' as never] }, INDUSTRIES).some((e) =>
      e.includes('无效的报告类型'),
    ),
  );
  assert.ok(
    validateTaskParams({ ...base(), companies: [], industries: ['银行业'] }, INDUSTRIES).some((e) =>
      e.includes('不支持的行业门类'),
    ),
  );
});

test('paramsToCliArgs 映射与 CLI 参数面一致', () => {
  const args = paramsToCliArgs(
    { companies: ['平安银行', '浦发银行'], industries: [], year: 2024, types: ['annual', 'semi'], sleepMs: 1000, limit: 5 },
    true,
  );
  assert.deepEqual(args, [
    '--company', '平安银行,浦发银行',
    '--year', '2024',
    '--type', 'annual,semi',
    '--sleep', '1000',
    '--limit', '5',
    '--dry-run',
  ]);
});

test('paramsToCliArgs 日期范围模式不带 --year', () => {
  const args = paramsToCliArgs(
    { companies: [], industries: ['金融业'], from: '2025-07-01', to: '2025-09-30', types: ['semi'], sleepMs: 200 },
    false,
  );
  assert.deepEqual(args, [
    '--industry', '金融业',
    '--from', '2025-07-01', '--to', '2025-09-30',
    '--type', 'semi',
    '--sleep', '200',
  ]);
});

test('summarizeTask 生成运营可读的摘要名', () => {
  assert.equal(
    summarizeTask({ companies: [], industries: ['金融业'], year: 2024, types: ['annual'], sleepMs: 1000 }, false),
    '金融业 · 2024 · 年报',
  );
  assert.equal(
    summarizeTask({ companies: ['平安银行'], industries: [], from: '2025-07-01', to: '2025-09-30', types: ['semi', 'annual'], sleepMs: 1000 }, true),
    '平安银行 · 2025-07-01~2025-09-30 · 中报/年报 · 预览',
  );
});

test('createWeatherApiParams 生成合法的天气采集参数并通过校验', async () => {
  const { createWeatherApiParams } = await import('../shared/task-params.js');
  const p = createWeatherApiParams('上海');
  assert.equal(p.sourceType, 'api-connector');
  assert.equal(p.name, '上海天气数据采集');
  assert.ok(p.request.url.includes('wttr.in'));
  assert.deepEqual(validateTaskParams(p), []);
  assert.equal(summarizeTask(p, false), 'API采集 · 上海天气数据采集');
  assert.equal(summarizeTask(p, true), '【预览】API采集 · 上海天气数据采集');
});

test('COLLECTOR_SCENARIOS 包含商品价格对比、固化爬虫、天气API与定制场景', async () => {
  const { COLLECTOR_SCENARIOS } = await import('../shared/task-params.js');
  const ids = COLLECTOR_SCENARIOS.map((s) => s.id);
  assert.ok(ids.includes('product-price-comparison'));
  assert.ok(ids.includes('cninfo-reports'));
  assert.ok(ids.includes('weather-api'));
  assert.ok(ids.includes('custom-request'));
});

test('createSampleProductComparisonParams 生成合法的商品对比参数并通过校验', async () => {
  const { createSampleProductComparisonParams } = await import('../shared/task-params.js');
  const p = createSampleProductComparisonParams();
  assert.equal(p.sourceType, 'web-scraper');
  assert.equal(p.urls.length, 9);
  assert.equal(p.mock, true);
  assert.equal(p.analyze, true);
  assert.deepEqual(validateTaskParams(p), []);
  assert.equal(summarizeTask(p, false), '商品价格分析 · 品牌A/B/C商品标价中位数对比样板');
});

test('web-scraper 私网/回环采集 URL 被出口门禁拒绝，baseUrl（自托管端点）豁免', () => {
  const bad = { sourceType: 'web-scraper' as const, name: 't', urls: ['http://127.0.0.1/x'] };
  assert.ok(validateTaskParams(bad).some((e) => e.includes('内网')));

  const bad2 = { sourceType: 'web-scraper' as const, name: 't', urls: ['http://[::1]/x'] };
  assert.ok(validateTaskParams(bad2).some((e) => e.includes('内网')));

  const ok = {
    sourceType: 'web-scraper' as const,
    name: 't',
    urls: ['https://example.com/p'],
    baseUrl: 'http://localhost:3002',
  };
  assert.deepEqual(validateTaskParams(ok), []);
});


