/**
 * 网页采集事件流强类型定义与 NDJSON 解析器（对齐工作台事件流体系）
 */

export interface ScrapeSummary {
  total: number;
  succeeded: number;
  failed: number;
  durationMs: number;
  outDir: string;
}

export type ScrapeEvent =
  | { type: 'start'; totalUrls: number; mock: boolean; provider: string }
  | { type: 'scraping'; index: number; total: number; url: string }
  | {
      type: 'snapshot_saved';
      index: number;
      snapshotId: string;
      url: string;
      contentHash: string;
      snapshotDir: string;
    }
  | {
      type: 'scrape_failed';
      index: number;
      url: string;
      code: string;
      reason: string;
    }
  | { type: 'done'; summary: ScrapeSummary }
  | { type: 'error'; message: string };

export type ScrapeReporter = (event: ScrapeEvent) => void;

/**
 * 解析 NDJSON 文本行。非 JSON 或未知结构安全返回 null。
 */
export function parseScrapeEvent(line: string): ScrapeEvent | null {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof obj.type !== 'string') return null;
    return obj as unknown as ScrapeEvent;
  } catch {
    return null;
  }
}
