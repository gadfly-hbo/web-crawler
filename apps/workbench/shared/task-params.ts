/** 共享：采集任务参数模型与校验（前后端共用；规则与 cninfo-reports CLI validate 对齐）。 */

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

export const MIN_SLEEP_MS = 200;
export const DEFAULT_SLEEP_MS = 1000;

const VALID_TYPES = new Set(['annual', 'semi', 'q1', 'q3']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 校验任务参数，返回中文错误文案列表（空数组 = 合法）。
 * 规则与 crawlers/cninfo-reports/src/cli.ts 的 validate() 一一对应；
 * industries 传入当前支持的行业门类清单（来自爬虫 industries 数据模块）。
 */
export function validateTaskParams(
  params: TaskParams,
  knownIndustries: readonly string[],
): string[] {
  const errors: string[] = [];
  if (params.companies.length === 0 && params.industries.length === 0) {
    errors.push('必须至少选择一个公司或一个行业');
  }
  const invalidTypes = params.types.filter((t) => !VALID_TYPES.has(t));
  if (invalidTypes.length > 0) {
    errors.push(`无效的报告类型：${invalidTypes.join('、')}`);
  }
  if (params.types.length === 0) {
    errors.push('请至少选择一种报告类型');
  }
  const unknownIndustries = params.industries.filter((i) => !knownIndustries.includes(i));
  if (unknownIndustries.length > 0) {
    errors.push(`不支持的行业门类：${unknownIndustries.join('、')}`);
  }
  const hasRange = Boolean(params.from || params.to);
  if (params.year != null && hasRange) errors.push('报告年份与公告日期范围只能二选一');
  if (params.year != null && (!Number.isInteger(params.year) || params.year < 1990 || params.year > 2100)) {
    errors.push('报告年份应为 1990~2100 之间的整数');
  }
  if (params.year == null && !hasRange) errors.push('必须指定时间：报告年份或公告日期范围');
  if (Boolean(params.from) !== Boolean(params.to)) errors.push('公告日期的起止需成对填写');
  if (params.from && !DATE_RE.test(params.from)) errors.push('开始日期格式应为 YYYY-MM-DD');
  if (params.to && !DATE_RE.test(params.to)) errors.push('结束日期格式应为 YYYY-MM-DD');
  if (params.from && params.to && params.from > params.to) errors.push('开始日期不能晚于结束日期');
  if (!Number.isFinite(params.sleepMs) || params.sleepMs < MIN_SLEEP_MS) {
    errors.push(`请求间隔不能低于 ${MIN_SLEEP_MS}ms（对目标站点保持礼貌）`);
  }
  if (params.limit != null && (!Number.isInteger(params.limit) || params.limit < 1)) {
    errors.push('最多公司数应为正整数');
  }
  return errors;
}

/** 参数 → cninfo-reports CLI argv（--json 与 -o 由调用方追加）。 */
export function paramsToCliArgs(params: TaskParams, dryRun: boolean): string[] {
  const args: string[] = [];
  if (params.companies.length > 0) args.push('--company', params.companies.join(','));
  if (params.industries.length > 0) args.push('--industry', params.industries.join(','));
  if (params.year != null) args.push('--year', String(params.year));
  if (params.from && params.to) args.push('--from', params.from, '--to', params.to);
  args.push('--type', params.types.join(','));
  args.push('--sleep', String(params.sleepMs));
  if (params.limit != null) args.push('--limit', String(params.limit));
  if (dryRun) args.push('--dry-run');
  return args;
}

/** 自动生成任务摘要名（如「金融业 · 2024 · 年报/中报」）。 */
export function summarizeTask(params: TaskParams, dryRun: boolean): string {
  const scope = params.companies.length > 0 ? params.companies.join('、') : params.industries.join('、');
  const time = params.year != null ? `${params.year}` : `${params.from}~${params.to}`;
  const types = params.types.map((t) => REPORT_TYPE_LABELS[t]).join('/');
  return `${scope} · ${time} · ${types}${dryRun ? ' · 预览' : ''}`;
}
