import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  calculateQualityMetrics,
  computeFileSha256,
  type DeliveryManifest,
  generateProductDatasetSchema,
  verifyDeliveryPackage,
} from '../src/manifest.js';

test('Manifest Schema & Metrics: 数据模式与质量指标计算', () => {
  const schema = generateProductDatasetSchema();
  assert.ok(schema.length >= 8);
  const priceField = schema.find((f) => f.name === 'price');
  assert.ok(priceField);
  assert.equal(priceField.type, 'number');
  assert.equal(priceField.nullable, true);

  const metrics = calculateQualityMetrics(
    [
      {
        recordId: 'r1',
        url: 'u1',
        brand: 'A',
        title: 'T1',
        price: 100,
        currency: 'CNY',
        category: 'C',
        observedAt: '',
        qualityStatus: 'valid',
      },
      {
        recordId: 'r2',
        url: 'u2',
        brand: 'B',
        title: 'T2',
        price: null,
        currency: 'CNY',
        category: 'C',
        observedAt: '',
        qualityStatus: 'missing_price',
      },
    ],
    [
      {
        id: 'e1',
        taskId: 't',
        recordId: 'r1',
        snapshotId: 's',
        field: 'price',
        value: 100,
        sourceText: '100',
        lineStart: 1,
        lineEnd: 1,
        charOffsetStart: 0,
        charOffsetEnd: 3,
        confidence: 0.99,
        extractorType: 'css',
        extractedAt: '',
      },
    ]
  );

  assert.equal(metrics.totalRecords, 2);
  assert.equal(metrics.validRecords, 1);
  assert.equal(metrics.missingPriceRecords, 1);
  assert.equal(metrics.evidenceCoverageRate, 1.0);
  assert.equal(metrics.dataCompletenessRate, 0.5);
});

test('DeliveryPackageVerifier: 能够有效检验哈希防篡改与文件缺失', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'pkg-test-'));

  try {
    const dataFile = path.join(tmp, 'records.jsonl');
    await writeFile(dataFile, '{"id": 1, "price": 299}\n', 'utf8');

    const csvFile = path.join(tmp, 'analysis.csv');
    await writeFile(csvFile, 'brand,median\nBrand A,299\n', 'utf8');

    const hashData = await computeFileSha256(dataFile);
    const hashCsv = await computeFileSha256(csvFile);

    assert.equal(hashData.length, 64);
    assert.equal(hashCsv.length, 64);

    const manifest: DeliveryManifest = {
      manifestVersion: '1.0.0',
      datasetId: 'pkg_test_1',
      datasetVersion: 'v1.0-alpha',
      generatedAt: new Date().toISOString(),
      generator: {
        name: 'web-crawler/firecrawl-scraper',
        version: '0.1.0',
        description: '测试引擎',
      },
      sourceSummary: { totalUrls: 1, succeeded: 1, failed: 0 },
      schema: { fields: [] },
      qualityMetrics: {
        totalRecords: 1,
        validRecords: 1,
        missingPriceRecords: 0,
        invalidPriceRecords: 0,
        evidenceCoverageRate: 1.0,
        dataCompletenessRate: 1.0,
      },
      files: {
        recordsData: 'records.jsonl',
        analysisCsv: 'analysis.csv',
        summaryJson: 'analysis_summary.json',
        snapshotsDir: 'snapshots/',
      },
      checksums: {
        'records.jsonl': hashData,
        'analysis.csv': hashCsv,
      },
    };

    await writeFile(path.join(tmp, 'manifest.json'), JSON.stringify(manifest), 'utf8');

    // 1. 正常校验
    const check1 = await verifyDeliveryPackage(tmp);
    assert.equal(check1.valid, true);
    assert.equal(check1.mismatches.length, 0);

    // 2. 篡改 analysis.csv 文件
    await writeFile(csvFile, 'brand,median\nBrand A,999\n', 'utf8');
    const check2 = await verifyDeliveryPackage(tmp);
    assert.equal(check2.valid, false);
    assert.ok(check2.mismatches.some((m) => m.includes('analysis.csv')));

    // 3. 删除 records.jsonl 模拟文件缺失
    await rm(dataFile);
    const check3 = await verifyDeliveryPackage(tmp);
    assert.equal(check3.valid, false);
    assert.ok(check3.mismatches.some((m) => m.includes('records.jsonl') && m.includes('缺失')));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
