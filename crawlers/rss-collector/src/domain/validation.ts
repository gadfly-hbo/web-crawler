/** validateRssParams：URL 白名单（任务即白名单）与参数边界（PRD 决策 13 / G6）。
 * opts.allowPrivateOrigin 仅测试豁免（CLI 经 RSS_ALLOW_PRIVATE_ORIGIN=1 传入，镜像 cninfo 先例）；
 * workbench 调用不传，校验永远严格。 */
import { egressBlockReason } from 'data-governance/egress';

import type { RssTaskParams } from './types.js';

export const MAX_FEED_URLS = 5;
export const MAX_ENTRIES_PER_FEED = 500;
export const DEFAULT_ENTRIES_PER_FEED = 50;
export const DEFAULT_DEADLINE_MS = 60000;

export function validateRssParams(
  params: RssTaskParams,
  opts: { allowPrivateOrigin?: boolean } = {}
): string[] {
  const errors: string[] = [];
  if (!params.name || !params.name.trim()) {
    errors.push('任务名称不能为空');
  }
  if (!Array.isArray(params.urls) || params.urls.length === 0) {
    errors.push('Feed URL 列表不能为空（1-5 个）');
  } else {
    if (params.urls.length > MAX_FEED_URLS) {
      errors.push(`Feed URL 数量超过上限 ${MAX_FEED_URLS}`);
    }
    const seen = new Set<string>();
    for (const u of params.urls) {
      const trimmed = (u ?? '').trim();
      if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
        errors.push(`URL 格式不合法: ${u}`);
        continue;
      }
      if (seen.has(trimmed)) {
        errors.push(`Feed URL 重复: ${trimmed}`);
        continue;
      }
      seen.add(trimmed);
      if (opts.allowPrivateOrigin === true) continue; // 测试豁免：仅跳过私网判定，格式检查已在上方完成
      const egressReason = egressBlockReason(trimmed);
      if (egressReason) {
        errors.push(`${egressReason}: ${trimmed}`);
      }
    }
  }
  if (
    params.limit !== undefined &&
    (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > MAX_ENTRIES_PER_FEED)
  ) {
    errors.push(`limit 应为 1-${MAX_ENTRIES_PER_FEED} 的整数`);
  }
  if (
    params.deadlineMs !== undefined &&
    (!Number.isInteger(params.deadlineMs) || params.deadlineMs < 1)
  ) {
    errors.push('deadlineMs 应为正整数（毫秒）');
  }
  return errors;
}
