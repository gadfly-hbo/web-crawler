import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  summarizeTask,
  validateTaskParams,
  type ApiConnectorParams,
  type CninfoTaskParams,
  type TaskParams,
} from '../shared/task-params.js';

test('向后兼容：缺省 sourceType 视为 cninfo 任务并执行 cninfo 校验', () => {
  const legacyParams = {
    companies: ['000001'],
    industries: [],
    year: 2024,
    types: ['annual'],
    sleepMs: 1000,
  } as TaskParams;

  const errs = validateTaskParams(legacyParams);
  assert.deepEqual(errs, []);
  assert.equal(summarizeTask(legacyParams, false), '000001 · 2024 · 年报');
});

test('api-connector 合法参数校验通过', () => {
  const validApiParams: ApiConnectorParams = {
    sourceType: 'api-connector',
    name: '测试研报接口',
    request: {
      url: 'https://api.example.com/reports?page={{page}}',
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
      downloadUrlPath: 'downloadUrl',
    },
    sleepMs: 1000,
  };

  const errs = validateTaskParams(validApiParams);
  assert.deepEqual(errs, []);
  assert.equal(summarizeTask(validApiParams, false), 'API采集 · 测试研报接口');
  assert.equal(summarizeTask(validApiParams, true), '【预览】API采集 · 测试研报接口');
});

test('api-connector 非法参数拒绝并返回中文错误列表', () => {
  const invalidParams: ApiConnectorParams = {
    sourceType: 'api-connector',
    name: '',
    request: {
      url: 'not-a-valid-url',
      method: 'PUT' as any,
    },
    pagination: {
      type: 'page_number',
      pageParam: '',
      startPage: -1,
      pageSize: 0,
      maxPages: 0,
    },
    extraction: {
      listPath: '',
      titlePath: '',
    },
    sleepMs: 50,
  };

  const errs = validateTaskParams(invalidParams);
  assert.ok(errs.some((e) => e.includes('接口任务名称')));
  assert.ok(errs.some((e) => e.includes('URL')));
  assert.ok(errs.some((e) => e.includes('GET 或 POST')));
  assert.ok(errs.some((e) => e.includes('分页页码参数')));
  assert.ok(errs.some((e) => e.includes('起始页码')));
  assert.ok(errs.some((e) => e.includes('每页条数')));
  assert.ok(errs.some((e) => e.includes('最大翻页数')));
  assert.ok(errs.some((e) => e.includes('数据列表提取路径')));
  assert.ok(errs.some((e) => e.includes('标题提取路径')));
  assert.ok(errs.some((e) => e.includes('请求间隔不能低于')));
});
