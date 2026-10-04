/** 爬虫事件流强类型定义与 NDJSON 解析器。 */
import type { ReportType } from './domain/types.js';

export interface CrawlSummary {
  companies: number;
  matched: number;
  downloaded: number;
  skipped: number;
  bytes: number;
  failed: number;
  outDir: string;
}

export type CrawlEvent =
  | { type: 'start'; totalCompanies: number; dryRun: boolean }
  | { type: 'queryError'; target: string; reason: string }
  | { type: 'company'; index: number; total: number; code: string; name: string }
  | {
      type: 'file';
      status: 'downloaded' | 'skipped' | 'failed';
      code: string;
      name: string;
      reportType?: ReportType;
      title?: string;
      path?: string;
      bytes?: number;
      reason?: string;
    }
  | { type: 'preview'; companies: number; reports: number }
  | { type: 'done'; summary: CrawlSummary }
  | { type: 'error'; message: string }
  | { type: 'stderr'; text: string }
  // 运行过程事件（供终端文本逐字节渲染，NDJSON 模式过滤）
  | { type: 'resolvingStocks' }
  | { type: 'resolvedCompany'; code: string; name: string }
  | { type: 'resolvedIndustry'; industry: string }
  | {
      type: 'searchPlan';
      targetsCount: number;
      types: ReportType[];
      seDate: string;
      outDir: string;
      dryRun: boolean;
    }
  | { type: 'queryStart'; target: string }
  | { type: 'queryMatched'; target: string; total: number; matched: number }
  | { type: 'companiesTotal'; count: number; limit?: number }
  | { type: 'fileDryRun'; reportType: ReportType; path: string };

/**
 * 解析 NDJSON 文本行。非 JSON 或未知结构安全返回 null。
 */
export function parseCrawlEvent(line: string): CrawlEvent | null {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof obj.type !== 'string') return null;
    return obj as unknown as CrawlEvent;
  } catch {
    return null;
  }
}
