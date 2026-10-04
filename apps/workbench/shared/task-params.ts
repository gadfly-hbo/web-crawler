/** 共享：采集任务参数模型与多数据源契约。 */
import {
  MIN_SLEEP_MS,
  summarizeTask as summarizeCninfoTask,
  validateTaskParams as validateCninfoParams,
  type TaskParams as CninfoTaskParamsFromDomain,
} from 'cninfo-reports/domain';

import {
  validateApiConnectorParams,
  type ApiConnectorParams,
} from 'api-connector/domain';

export * from 'cninfo-reports/domain';
export type { ApiConnectorParams } from 'api-connector/domain';
export { validateApiConnectorParams } from 'api-connector/domain';

export type SourceType = 'cninfo' | 'api-connector';

export type CninfoTaskParams = CninfoTaskParamsFromDomain & {
  sourceType?: 'cninfo';
};

export type TaskParams = CninfoTaskParams | ApiConnectorParams;


export function validateTaskParams(
  params: TaskParams,
  knownIndustries?: readonly string[],
): string[] {
  const sourceType = params.sourceType ?? 'cninfo';
  if (sourceType === 'cninfo') {
    return validateCninfoParams(params as CninfoTaskParams, knownIndustries);
  }
  if (sourceType === 'api-connector') {
    return validateApiConnectorParams(params as ApiConnectorParams);
  }
  return [`不支持的数据源类型: ${(params as any).sourceType}`];
}

export function summarizeTask(params: TaskParams, dryRun: boolean): string {
  if (params.sourceType === 'api-connector') {
    const prefix = dryRun ? '【预览】' : '';
    return `${prefix}API采集 · ${params.name || '未命名'}`;
  }
  return summarizeCninfoTask(params, dryRun);
}

export interface ApiPresetTemplate {
  id: string;
  name: string;
  description: string;
  config: Omit<ApiConnectorParams, 'sourceType'>;
}

export const API_PRESET_TEMPLATES: ApiPresetTemplate[] = [
  {
    id: 'sample-brokerage-research',
    name: '示例：公开证券研报接口模板',
    description: '演示标准的 GET 分页研报列表拉取与 PDF 下载',
    config: {
      name: '宏观与行业研报示例',
      request: {
        url: 'https://example.com/api/reports?page={{page}}&size={{pageSize}}',
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      },
      pagination: {
        type: 'page_number',
        pageParam: 'page',
        pageSizeParam: 'size',
        startPage: 1,
        pageSize: 20,
        maxPages: 10,
        hasMorePath: 'data.hasMore',
        totalPath: 'data.total',
      },
      extraction: {
        listPath: 'data.list',
        titlePath: 'title',
        itemKeyPath: 'id',
        downloadUrlPath: 'pdfUrl',
        datePath: 'publishDate',
      },
      sleepMs: 1000,
    },
  },
  {
    id: 'sample-json-data',
    name: '示例：纯结构化数据接口（无文件下载）',
    description: '演示 POST 分页查询与 JSON 结果采集',
    config: {
      name: '行业统计指标列表',
      request: {
        url: 'https://example.com/api/v1/statistics',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        bodyTemplate: '{"page": {{page}}, "limit": {{pageSize}}}',
      },
      pagination: {
        type: 'page_number',
        pageParam: 'page',
        pageSizeParam: 'limit',
        startPage: 1,
        pageSize: 50,
        maxPages: 5,
        hasMorePath: 'hasMore',
      },
      extraction: {
        listPath: 'items',
        titlePath: 'metricName',
        itemKeyPath: 'metricId',
        datePath: 'timestamp',
      },
      sleepMs: 500,
    },
  },
];
