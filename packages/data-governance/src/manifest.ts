import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FieldEvidence } from './evidence.js';

export interface DeliveryFieldSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'null';
  description: string;
  nullable: boolean;
}

export interface DatasetQualityMetrics {
  totalRecords: number;
  validRecords: number;
  missingPriceRecords?: number;
  invalidPriceRecords?: number;
  evidenceCoverageRate: number; // 具有可核验原文证据的记录/字段占比 (0 ~ 1)
  dataCompletenessRate: number; // 有效样本率 (0 ~ 1)
}

export interface DeliveryManifest {
  manifestVersion: '1.0.0';
  datasetId: string;
  datasetVersion: string;
  generatedAt: string;
  generator: {
    name: string;
    version: string;
    description: string;
  };
  sourceSummary: {
    sourceType?: string;
    totalUrls?: number;
    totalRequests?: number;
    succeeded: number;
    failed: number;
  };
  schema: {
    fields: DeliveryFieldSchema[];
  };
  qualityMetrics: DatasetQualityMetrics;
  files: Record<string, string | undefined>;
  checksums: Record<string, string>; // 关键文件 relative_path -> SHA-256
}

/**
 * 流式计算文件的 SHA-256 哈希值
 */
export async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', (err) => reject(err));
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * 计算数据集质量指标与证据覆盖度
 */
export function calculateQualityMetrics(
  records: Array<{ qualityStatus?: string; [key: string]: any }>,
  evidences: FieldEvidence[]
): DatasetQualityMetrics {
  const total = records.length;
  if (total === 0) {
    return {
      totalRecords: 0,
      validRecords: 0,
      evidenceCoverageRate: 0,
      dataCompletenessRate: 0,
    };
  }

  let valid = 0;
  let missingPrice = 0;
  let invalidPrice = 0;

  for (const r of records) {
    if (!r.qualityStatus || r.qualityStatus === 'valid') valid++;
    else if (r.qualityStatus === 'missing_price') missingPrice++;
    else invalidPrice++;
  }

  const recordsWithEvidence = new Set(
    evidences.filter((e) => e.confidence > 0).map((e) => e.recordId)
  ).size;

  const evidenceCoverageRate = valid > 0 ? Number((recordsWithEvidence / valid).toFixed(4)) : 0;
  const dataCompletenessRate = Number((valid / total).toFixed(4));

  return {
    totalRecords: total,
    validRecords: valid,
    missingPriceRecords: missingPrice,
    invalidPriceRecords: invalidPrice,
    evidenceCoverageRate,
    dataCompletenessRate,
  };
}

/**
 * 通用便捷构造器：为指定目录构建并落盘 DeliveryManifest
 */
export async function createAndSaveDeliveryManifest(options: {
  dir: string;
  datasetId: string;
  sourceType: string;
  generatorName: string;
  generatorVersion?: string;
  generatorDesc?: string;
  recordsCount: number;
  validCount: number;
  filesToSign: string[];
  schemaFields?: DeliveryFieldSchema[];
  evidenceCount?: number;
}): Promise<DeliveryManifest> {
  const {
    dir,
    datasetId,
    sourceType,
    generatorName,
    generatorVersion = '0.1.0',
    generatorDesc = '统一严肃数据采集与治理引擎',
    recordsCount,
    validCount,
    filesToSign,
    schemaFields = [],
    evidenceCount = 0,
  } = options;

  const checksums: Record<string, string> = {};
  for (const file of filesToSign) {
    const fullPath = path.join(dir, file);
    if (existsSync(fullPath)) {
      checksums[file] = await computeFileSha256(fullPath);
    }
  }

  const completeness = recordsCount > 0 ? Number((validCount / recordsCount).toFixed(4)) : 1.0;
  const evidenceRate = validCount > 0 ? Number((Math.min(validCount, evidenceCount) / validCount).toFixed(4)) : 1.0;

  const manifest: DeliveryManifest = {
    manifestVersion: '1.0.0',
    datasetId,
    datasetVersion: `v1.0-${Date.now().toString(36)}`,
    generatedAt: new Date().toISOString(),
    generator: {
      name: generatorName,
      version: generatorVersion,
      description: generatorDesc,
    },
    sourceSummary: {
      sourceType,
      succeeded: validCount,
      failed: Math.max(0, recordsCount - validCount),
    },
    schema: {
      fields: schemaFields,
    },
    qualityMetrics: {
      totalRecords: recordsCount,
      validRecords: validCount,
      dataCompletenessRate: completeness,
      evidenceCoverageRate: evidenceRate,
    },
    files: Object.fromEntries(filesToSign.map((f) => [f, f])),
    checksums,
  };

  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return manifest;
}

/**
 * 校验已归档交付包的文件一致性与防篡改签名
 */
export async function verifyDeliveryPackage(packageDir: string): Promise<{
  valid: boolean;
  mismatches: string[];
  manifest: DeliveryManifest | null;
  error?: string;
}> {
  const manifestPath = path.join(packageDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    return { valid: false, mismatches: ['manifest.json missing'], manifest: null, error: 'manifest.json 不存在' };
  }

  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    const manifest: DeliveryManifest = JSON.parse(raw);
    const mismatches: string[] = [];

    for (const [relPath, expectedHash] of Object.entries(manifest.checksums)) {
      const fullPath = path.join(packageDir, relPath);
      if (!existsSync(fullPath)) {
        mismatches.push(`${relPath} (文件缺失)`);
        continue;
      }
      const actualHash = await computeFileSha256(fullPath);
      if (actualHash !== expectedHash) {
        mismatches.push(`${relPath} (哈希不匹配: 期望 ${expectedHash.slice(0, 8)}, 实际 ${actualHash.slice(0, 8)})`);
      }
    }

    return {
      valid: mismatches.length === 0,
      mismatches,
      manifest,
    };
  } catch (err: any) {
    return { valid: false, mismatches: [], manifest: null, error: err.message };
  }
}
