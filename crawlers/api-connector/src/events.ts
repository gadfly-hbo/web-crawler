/** 爬虫事件流强类型定义与 NDJSON 解析器（对齐统一工作台事件总线）。 */

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
      title?: string;
      path?: string;
      bytes?: number;
      reason?: string;
    }
  | { type: 'preview'; companies: number; reports: number }
  | { type: 'done'; summary: CrawlSummary }
  | { type: 'error'; message: string };

export type Reporter = (event: CrawlEvent) => void;

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
