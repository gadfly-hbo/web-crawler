import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { type PriceAnalysisReport, ProductPriceAnalyzer } from './analyzer.js';
import { EvidenceIndexStore, type FieldEvidence } from './evidence.js';
import { type ExtractedProductRecord, ProductPriceExtractor } from './extractor.js';
import {
  calculateQualityMetrics,
  computeFileSha256,
  type DeliveryManifest,
  generateProductDatasetSchema,
} from './manifest.js';
import type { SnapshotMetadata } from './storage.js';

export interface PipelineResult {
  report: PriceAnalysisReport;
  records: ExtractedProductRecord[];
  evidences: FieldEvidence[];
  manifest: DeliveryManifest;
}

export async function runProductAnalysisPipeline(
  snapshotsDir: string,
  outDir: string,
  baselineBrand = 'Brand A',
  taskId = 'task_default'
): Promise<PipelineResult> {
  await fs.mkdir(outDir, { recursive: true });

  const extractor = new ProductPriceExtractor();
  const records: ExtractedProductRecord[] = [];
  const allEvidences: FieldEvidence[] = [];

  // 初始化 SQLite 证据索引存储器
  const sqliteDbPath = path.join(outDir, 'evidence.sqlite');
  const evidenceStore = new EvidenceIndexStore(sqliteDbPath);

  let totalSnapshots = 0;

  // 读取快照目录
  try {
    const entries = await fs.readdir(snapshotsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.endsWith('.tmp')) continue;

      const subDir = path.join(snapshotsDir, entry.name);
      const metaPath = path.join(subDir, 'metadata.json');

      try {
        const metaContent = await fs.readFile(metaPath, 'utf8');
        const meta = JSON.parse(metaContent) as SnapshotMetadata;
        totalSnapshots++;

        let markdown: string | undefined;
        let html: string | undefined;

        if (meta.files.markdown) {
          markdown = await fs.readFile(path.join(subDir, meta.files.markdown), 'utf8').catch(() => undefined);
        }
        if (meta.files.html) {
          html = await fs.readFile(path.join(subDir, meta.files.html), 'utf8').catch(() => undefined);
        }

        const extractRes = extractor.extract({
          recordId: meta.snapshot_id,
          snapshotId: meta.snapshot_id,
          taskId,
          url: meta.target_url,
          markdown,
          html,
          observedAt: meta.received_at,
        });

        records.push(extractRes.record);
        if (extractRes.evidences.length > 0) {
          allEvidences.push(...extractRes.evidences);
          evidenceStore.insertBatch(extractRes.evidences);
        }
      } catch {
        // 单个快照读取失败不中断全局处理
      }
    }
  } catch {
    // 目录不存在
  }

  // 关闭 SQLite 句柄
  evidenceStore.close();

  // 1. 执行中位数与对比分析
  const report = ProductPriceAnalyzer.analyze(records, baselineBrand);

  // 2. 落盘 records.jsonl
  const jsonlLines = records.map((r) => JSON.stringify(r)).join('\n');
  await fs.writeFile(path.join(outDir, 'records.jsonl'), jsonlLines, 'utf8');

  // 3. 落盘 evidences.jsonl
  const evidenceLines = allEvidences.map((e) => JSON.stringify(e)).join('\n');
  await fs.writeFile(path.join(outDir, 'evidences.jsonl'), evidenceLines, 'utf8');

  // 4. 落盘 analysis_summary.json
  await fs.writeFile(path.join(outDir, 'analysis_summary.json'), JSON.stringify(report, null, 2), 'utf8');

  // 5. 落盘 analysis.csv
  const csvContent = ProductPriceAnalyzer.exportSummaryCsv(report);
  await fs.writeFile(path.join(outDir, 'analysis.csv'), csvContent, 'utf8');

  // 6. 落盘 schema.json
  const schemaFields = generateProductDatasetSchema();
  await fs.writeFile(path.join(outDir, 'schema.json'), JSON.stringify({ fields: schemaFields }, null, 2), 'utf8');

  // 7. 落盘 quality_report.json
  const qualityMetrics = calculateQualityMetrics(records, allEvidences);
  await fs.writeFile(path.join(outDir, 'quality_report.json'), JSON.stringify(qualityMetrics, null, 2), 'utf8');

  // 8. 计算各关键文件 SHA-256 并生成 DeliveryManifest
  const checksums: Record<string, string> = {};
  const filesToSign = [
    'records.jsonl',
    'analysis.csv',
    'analysis_summary.json',
    'schema.json',
    'quality_report.json',
    'evidence.sqlite',
    'evidences.jsonl',
  ];

  for (const fileName of filesToSign) {
    const fullPath = path.join(outDir, fileName);
    if (existsSync(fullPath)) {
      checksums[fileName] = await computeFileSha256(fullPath);
    }
  }

  const manifest: DeliveryManifest = {
    manifestVersion: '1.0.0',
    datasetId: taskId,
    datasetVersion: `v1.0-${Date.now().toString(36)}`,
    generatedAt: new Date().toISOString(),
    generator: {
      name: 'web-crawler/firecrawl-scraper',
      version: '0.1.0',
      description: '工业级严肃数据清洗、证据链索引与对比分析引擎',
    },
    sourceSummary: {
      totalUrls: totalSnapshots,
      succeeded: records.length,
      failed: Math.max(0, totalSnapshots - records.length),
    },
    schema: {
      fields: schemaFields,
    },
    qualityMetrics,
    files: {
      recordsData: 'records.jsonl',
      analysisCsv: 'analysis.csv',
      summaryJson: 'analysis_summary.json',
      evidenceIndex: existsSync(sqliteDbPath) ? 'evidence.sqlite' : undefined,
      evidenceJsonl: 'evidences.jsonl',
      snapshotsDir: 'snapshots/',
    },
    checksums,
  };

  // 9. 落盘 manifest.json
  await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  return { report, records, evidences: allEvidences, manifest };
}
