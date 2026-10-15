/**
 * RSS 采集事件流强类型定义与 NDJSON 解析器。
 * 类型名采用 workbench reducer 已消费的方言（G5/G11）：done.summary 与 CrawlSummary 兼容，
 * reducer 零改动即可驱动进度、失败清单与终态分级。
 */

export interface RssSummary {
  companies: number;
  matched: number;
  downloaded: number;
  skipped: number;
  bytes: number;
  failed: number;
  outDir: string;
}

export type RssEvent =
  | { type: 'start'; totalCompanies: number; dryRun: boolean }
  | { type: 'company'; index: number; total: number; code: string; name: string }
  | {
      type: 'file';
      status: 'downloaded' | 'failed';
      code: string;
      name: string;
      title?: string;
      path?: string;
      bytes?: number;
      reason?: string;
    }
  | { type: 'queryError'; target: string; reason: string }
  | { type: 'done'; summary: RssSummary }
  | { type: 'error'; message: string };

/**
 * 解析 NDJSON 文本行。非 JSON 或未知结构安全返回 null。
 */
export function parseRssEvent(line: string): RssEvent | null {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof obj.type !== 'string') return null;
    return obj as unknown as RssEvent;
  } catch {
    return null;
  }
}
