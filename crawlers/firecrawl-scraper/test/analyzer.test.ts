import assert from 'node:assert/strict';
import test from 'node:test';
import { ProductPriceAnalyzer } from '../src/analyzer.js';
import type { ExtractedProductRecord } from '../src/extractor.js';

test('ProductPriceAnalyzer: 对齐产品方案 v1.0 第16节基准测试样例', () => {
  // 合成样例：A(199, 299, 399), B(159, 259, 359), C(239, 339, 439)
  const mockRecords: ExtractedProductRecord[] = [
    { recordId: '1', url: 'https://brand-a.example/1', brand: 'Brand A', title: 'A1', price: 199, currency: 'CNY', category: 'shoes', observedAt: '', qualityStatus: 'valid' },
    { recordId: '2', url: 'https://brand-a.example/2', brand: 'Brand A', title: 'A2', price: 299, currency: 'CNY', category: 'shoes', observedAt: '', qualityStatus: 'valid' },
    { recordId: '3', url: 'https://brand-a.example/3', brand: 'Brand A', title: 'A3', price: 399, currency: 'CNY', category: 'shoes', observedAt: '', qualityStatus: 'valid' },

    { recordId: '4', url: 'https://brand-b.example/1', brand: 'Brand B', title: 'B1', price: 159, currency: 'CNY', category: 'shoes', observedAt: '', qualityStatus: 'valid' },
    { recordId: '5', url: 'https://brand-b.example/2', brand: 'Brand B', title: 'B2', price: 259, currency: 'CNY', category: 'shoes', observedAt: '', qualityStatus: 'valid' },
    { recordId: '6', url: 'https://brand-b.example/3', brand: 'Brand B', title: 'B3', price: 359, currency: 'CNY', category: 'shoes', observedAt: '', qualityStatus: 'valid' },

    { recordId: '7', url: 'https://brand-c.example/1', brand: 'Brand C', title: 'C1', price: 239, currency: 'CNY', category: 'shoes', observedAt: '', qualityStatus: 'valid' },
    { recordId: '8', url: 'https://brand-c.example/2', brand: 'Brand C', title: 'C2', price: 339, currency: 'CNY', category: 'shoes', observedAt: '', qualityStatus: 'valid' },
    { recordId: '9', url: 'https://brand-c.example/3', brand: 'Brand C', title: 'C3', price: 439, currency: 'CNY', category: 'shoes', observedAt: '', qualityStatus: 'valid' },
  ];

  const report = ProductPriceAnalyzer.analyze(mockRecords, 'Brand A');

  assert.equal(report.totalRecords, 9);
  assert.equal(report.validRecords, 9);

  const brandA = report.brandSummaries.find((b) => b.brand === 'Brand A');
  const brandB = report.brandSummaries.find((b) => b.brand === 'Brand B');
  const brandC = report.brandSummaries.find((b) => b.brand === 'Brand C');

  assert.ok(brandA && brandB && brandC);

  // 1. 验证中位数
  assert.equal(brandA.medianPrice, 299, 'Brand A 中位数应为 299');
  assert.equal(brandB.medianPrice, 259, 'Brand B 中位数应为 259');
  assert.equal(brandC.medianPrice, 339, 'Brand C 中位数应为 339');

  // 2. 验证相对基准品牌 A 的中位数差异百分比
  // B 相对 A: (259 / 299 - 1) * 100% ≈ -13.4%
  // C 相对 A: (339 / 299 - 1) * 100% ≈ +13.4%
  assert.equal(brandA.relativeDiffToBaselinePercent, 0);
  assert.equal(brandB.relativeDiffToBaselinePercent, -13.4);
  assert.equal(brandC.relativeDiffToBaselinePercent, 13.4);

  // 3. 验证 CSV 导出
  const csv = ProductPriceAnalyzer.exportSummaryCsv(report);
  assert.ok(csv.includes('Brand A,3,0,CNY,199,399,299,299'));
  assert.ok(csv.includes('Brand B,3,0,CNY,159,359,259,259,-13.4%'));

  // 4. 验证事实与限制披露不为空
  assert.ok(report.caveatsAndLimits.length > 0);
});

test('ProductPriceAnalyzer: 中位数纯函数边界测试', () => {
  assert.equal(ProductPriceAnalyzer.calculateMedian([]), 0);
  assert.equal(ProductPriceAnalyzer.calculateMedian([100]), 100);
  assert.equal(ProductPriceAnalyzer.calculateMedian([100, 200]), 150);
  assert.equal(ProductPriceAnalyzer.calculateMedian([100, 200, 300]), 200);
  assert.equal(ProductPriceAnalyzer.calculateMedian([10, 20, 30, 40]), 25);
});
