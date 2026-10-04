/** 领域类型契约：报告类型、参数模型与证券信息。 */

export type ReportType = 'annual' | 'semi' | 'q1' | 'q3';

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  annual: '年报',
  semi: '中报',
  q1: '一季报',
  q3: '三季报',
};

export interface TaskParams {
  companies: string[];
  industries: string[];
  year?: number;
  from?: string;
  to?: string;
  types: ReportType[];
  limit?: number;
  sleepMs: number;
}

export interface StockInfo {
  code: string;
  name: string;
  pinyin: string;
  orgId: string;
  category: string;
}

export const MIN_SLEEP_MS = 200;
export const DEFAULT_SLEEP_MS = 1000;
