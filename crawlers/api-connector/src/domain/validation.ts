import type { ApiConnectorParams } from './types.js';

export const MIN_SLEEP_MS = 200;

export function validateApiConnectorParams(params: ApiConnectorParams): string[] {
  const errors: string[] = [];
  if (!params.name || !params.name.trim()) {
    errors.push('必须提供接口任务名称');
  }
  if (!params.request?.url || !params.request.url.trim()) {
    errors.push('必须提供请求 URL');
  } else {
    try {
      new URL(params.request.url.replace(/\{\{[^}]+\}\}/g, 'placeholder'));
    } catch {
      errors.push('请求 URL 格式不合法');
    }
  }
  if (!params.request?.method || !['GET', 'POST'].includes(params.request.method)) {
    errors.push('请求方法必须为 GET 或 POST');
  }
  if (!params.pagination?.pageParam || !params.pagination.pageParam.trim()) {
    errors.push('必须指定分页页码参数名称');
  }
  if (!Number.isInteger(params.pagination?.startPage) || params.pagination.startPage < 0) {
    errors.push('起始页码应为非负整数');
  }
  if (!Number.isInteger(params.pagination?.pageSize) || params.pagination.pageSize < 1) {
    errors.push('每页条数应为正整数');
  }
  if (
    params.pagination?.maxPages != null &&
    (!Number.isInteger(params.pagination.maxPages) || params.pagination.maxPages < 1)
  ) {
    errors.push('最大翻页数应为正整数');
  }
  if (!params.extraction?.listPath || !params.extraction.listPath.trim()) {
    errors.push('必须指定数据列表提取路径（如 data.items）');
  }
  if (!params.extraction?.titlePath || !params.extraction.titlePath.trim()) {
    errors.push('必须指定标题提取路径（如 title）');
  }
  if (!Number.isFinite(params.sleepMs) || params.sleepMs < MIN_SLEEP_MS) {
    errors.push(`请求间隔不能低于 ${MIN_SLEEP_MS}ms（对目标站点保持礼貌）`);
  }
  return errors;
}
