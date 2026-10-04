import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  extractArray,
  extractPath,
  extractString,
  parsePath,
} from '../src/json-path.js';

test('parsePath: 支持点路径、数组下标与根符号', () => {
  assert.deepEqual(parsePath('data.items'), ['data', 'items']);
  assert.deepEqual(parsePath('$.data.items'), ['data', 'items']);
  assert.deepEqual(parsePath('data.items[0].url'), ['data', 'items', '0', 'url']);
  assert.deepEqual(parsePath('items[12]'), ['items', '12']);
  assert.deepEqual(parsePath(''), []);
  assert.deepEqual(parsePath('$'), []);
  assert.deepEqual(parsePath('   '), []);
});

test('extractPath: 正常提取多层对象属性与数组元素', () => {
  const data = {
    code: 200,
    result: {
      total: 42,
      list: [
        { id: 1, title: '报告 A', meta: { downloadUrl: 'https://example.com/a.pdf' } },
        { id: 2, title: '报告 B', meta: { downloadUrl: 'https://example.com/b.pdf' } },
      ],
    },
  };

  assert.equal(extractPath(data, 'code'), 200);
  assert.equal(extractPath(data, 'result.total'), 42);
  assert.equal(extractPath(data, 'result.list[0].title'), '报告 A');
  assert.equal(extractPath(data, 'result.list[1].meta.downloadUrl'), 'https://example.com/b.pdf');
  assert.equal(extractPath(data, 'result.list.0.title'), '报告 A');
});

test('extractPath: 遇到不存在的路径安全返回 undefined 绝不抛错', () => {
  const data = { a: { b: null } };

  assert.equal(extractPath(data, 'a.b.c'), undefined);
  assert.equal(extractPath(data, 'nonexistent'), undefined);
  assert.equal(extractPath(data, 'a.b[0]'), undefined);
  assert.equal(extractPath(null, 'a.b'), undefined);
  assert.equal(extractPath(undefined, 'a.b'), undefined);
  assert.equal(extractPath('primitive', 'a.b'), undefined);
});

test('extractArray: 仅在目标为真实数组时返回数组', () => {
  const obj = {
    records: [1, 2, 3],
    single: { not: 'array' },
    text: 'hello',
  };

  assert.deepEqual(extractArray(obj, 'records'), [1, 2, 3]);
  assert.equal(extractArray(obj, 'single'), undefined);
  assert.equal(extractArray(obj, 'text'), undefined);
  assert.equal(extractArray(obj, 'missing'), undefined);
});

test('extractString: 安全提取字符串，并将基础类型转字符串，忽略对象/数组', () => {
  const obj = {
    str: 'hello',
    num: 12345,
    bool: true,
    nested: { x: 1 },
    arr: [1],
    nul: null,
  };

  assert.equal(extractString(obj, 'str'), 'hello');
  assert.equal(extractString(obj, 'num'), '12345');
  assert.equal(extractString(obj, 'bool'), 'true');
  assert.equal(extractString(obj, 'nested'), undefined);
  assert.equal(extractString(obj, 'arr'), undefined);
  assert.equal(extractString(obj, 'nul'), undefined);
  assert.equal(extractString(obj, 'absent'), undefined);
});
