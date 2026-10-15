import assert from 'node:assert/strict';
import test from 'node:test';
import { EvidenceIndexStore, locateSnippet } from '../src/evidence.js';
import { ProductPriceExtractor } from '../src/extractor.js';

test('locateSnippet: 正确计算字符偏移与 1-indexed 行号', () => {
  const content = [
    '# 旗舰款降噪耳机', // line 1
    '', // line 2
    '品牌: Sony', // line 3
    '售价: ¥1,999.00', // line 4
    '库存: 现货', // line 5
  ].join('\n');

  // 1. 匹配标题
  const locTitle = locateSnippet(content, '旗舰款降噪耳机');
  assert.ok(locTitle);
  assert.equal(locTitle.lineStart, 1);
  assert.equal(locTitle.lineEnd, 1);
  assert.equal(locTitle.charOffsetStart, 2);
  assert.equal(locTitle.charOffsetEnd, 9);

  // 2. 匹配第 4 行的价格
  const locPrice = locateSnippet(content, '¥1,999.00');
  assert.ok(locPrice);
  assert.equal(locPrice.lineStart, 4);
  assert.equal(locPrice.lineEnd, 4);

  // 3. 不存在的子串返回 null
  const locNone = locateSnippet(content, '苹果手机');
  assert.equal(locNone, null);
});

test('EvidenceIndexStore: SQLite 证据索引存储与多维查询', () => {
  const store = new EvidenceIndexStore(':memory:');

  const ev1 = store.insert({
    taskId: 'task_1',
    recordId: 'rec_101',
    snapshotId: 'snap_101',
    field: 'price',
    value: 299,
    sourceText: '¥299.00',
    selectorOrPattern: '.price',
    lineStart: 12,
    lineEnd: 12,
    charOffsetStart: 150,
    charOffsetEnd: 157,
    confidence: 0.99,
    extractorType: 'css',
  });

  const ev2 = store.insert({
    taskId: 'task_1',
    recordId: 'rec_101',
    snapshotId: 'snap_101',
    field: 'title',
    value: '轻量跑鞋',
    sourceText: '轻量跑鞋',
    selectorOrPattern: 'h1',
    lineStart: 3,
    lineEnd: 3,
    charOffsetStart: 20,
    charOffsetEnd: 24,
    confidence: 0.95,
    extractorType: 'css',
  });

  const ev3 = store.insert({
    taskId: 'task_2',
    recordId: 'rec_201',
    snapshotId: 'snap_201',
    field: 'price',
    value: 599,
    sourceText: '¥599.00',
    lineStart: 5,
    lineEnd: 5,
    charOffsetStart: 60,
    charOffsetEnd: 67,
    confidence: 0.9,
    extractorType: 'regex',
  });

  assert.ok(ev1.id);
  assert.ok(ev1.extractedAt);

  // 按 task 查询
  const listTask1 = store.query({ taskId: 'task_1' });
  assert.equal(listTask1.length, 2);
  assert.equal(listTask1[0].field, 'title'); // 默认按 line_start ASC 排序
  assert.equal(listTask1[1].field, 'price');

  // 按 task + record + field 查询
  const priceList = store.query({ taskId: 'task_1', recordId: 'rec_101', field: 'price' });
  assert.equal(priceList.length, 1);
  assert.equal(priceList[0].value, 299);
  assert.equal(priceList[0].sourceText, '¥299.00');

  // 按 ID 查询
  const fetched = store.getById(ev1.id);
  assert.ok(fetched);
  assert.equal(fetched.value, 299);

  store.close();
});

test('ProductPriceExtractor: 生成字段级完整证据', () => {
  const extractor = new ProductPriceExtractor();
  const md = '# 潮流板鞋\n\nBrand: Brand A\n分类: 休闲鞋\n标价: ¥359.00';

  const res = extractor.extract({
    taskId: 'task_test',
    recordId: 'rec_test',
    url: 'https://brand-a.example/shoes/01',
    markdown: md,
  });

  assert.equal(res.brand, 'Brand A');
  assert.equal(res.price, 359);
  assert.ok(res.evidences.length >= 3);

  const priceEvidence = res.evidences.find((e) => e.field === 'price');
  assert.ok(priceEvidence);
  assert.equal(priceEvidence.value, 359);
  assert.equal(priceEvidence.lineStart, 5);
  assert.equal(priceEvidence.lineEnd, 5);
  assert.equal(priceEvidence.extractorType, 'regex');
});
