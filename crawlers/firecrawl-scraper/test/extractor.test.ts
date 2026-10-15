import assert from 'node:assert/strict';
import test from 'node:test';
import { ProductPriceExtractor } from '../src/extractor.js';

test('ProductPriceExtractor: 正常解析带有价格标签的商品内容', () => {
  const extractor = new ProductPriceExtractor();

  const markdown = '# 超轻跑鞋 - 旗舰版\n\nBrand: Brand A\n分类: 运动鞋\n价格: ¥299.00';
  const html = '<div class="product"><h1>超轻跑鞋 - 旗舰版</h1><span class="price">¥299.00</span></div>';

  const res = extractor.extract({
    url: 'https://brand-a.example/shoes/101',
    markdown,
    html
  });

  assert.equal(res.brand, 'Brand A');
  assert.equal(res.title, '超轻跑鞋 - 旗舰版');
  assert.equal(res.price, 299);
  assert.equal(res.currency, 'CNY');
  assert.equal(res.category, '运动鞋');
  assert.equal(res.qualityStatus, 'valid');
});

test('ProductPriceExtractor: 价格缺失时不脑补0，显式记录为 null 并标注原因', () => {
  const extractor = new ProductPriceExtractor();

  const markdown = '# 概念展示商品\n\n分类: 展品\n说明: 暂未公开售价';

  const res = extractor.extract({
    url: 'https://brand-b.example/concept/201',
    markdown
  });

  assert.equal(res.price, null, '未标价时必须为 null，绝不能填充 0');
  assert.equal(res.qualityStatus, 'missing_price');
  assert.equal(res.missingReason, 'PRICE_NOT_FOUND_IN_SNAPSHOT');
});

test('ProductPriceExtractor: 支持解析带千分位与外币符号的价格', () => {
  const p1 = ProductPriceExtractor.parsePrice('$1,299.50');
  assert.equal(p1.price, 1299.5);
  assert.equal(p1.currency, 'USD');

  const p2 = ProductPriceExtractor.parsePrice('€ 89.00');
  assert.equal(p2.price, 89);
  assert.equal(p2.currency, 'EUR');

  const p3 = ProductPriceExtractor.parsePrice('免费');
  assert.equal(p3.price, null);
});
