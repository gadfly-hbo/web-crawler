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
import { egressBlockReason } from 'data-governance/egress';
import { validateRssParams, type RssTaskParams } from 'rss-collector/domain';

export * from 'cninfo-reports/domain';
export type { ApiConnectorParams } from 'api-connector/domain';
export { validateApiConnectorParams } from 'api-connector/domain';
export type { RssTaskParams } from 'rss-collector/domain';
export { validateRssParams } from 'rss-collector/domain';

export type SourceType = 'cninfo' | 'api-connector' | 'web-scraper' | 'rss';

export type CninfoTaskParams = CninfoTaskParamsFromDomain & {
  sourceType?: 'cninfo';
};

export interface WebScraperParams {
  sourceType: 'web-scraper';
  name: string;
  urls: string[];
  mock?: boolean;
  analyze?: boolean;
  baselineBrand?: string;
  apiKey?: string;
  baseUrl?: string;
}

export type TaskParams = (CninfoTaskParams | ApiConnectorParams | WebScraperParams | RssTaskParams) & {
  schemaVersion?: string;
  timeoutMs?: number;
};

export function validateWebScraperParams(params: WebScraperParams): string[] {
  const errors: string[] = [];
  if (!params.name || !params.name.trim()) {
    errors.push('任务名称不能为空');
  }
  if (!Array.isArray(params.urls) || params.urls.length === 0) {
    errors.push('目标 URL 列表不能为空');
  } else {
    for (const u of params.urls) {
      if (!u || !/^https?:\/\//i.test(u.trim())) {
        errors.push(`URL 格式不合法: ${u}`);
        continue;
      }
      const egressReason = egressBlockReason(u.trim());
      if (egressReason) {
        errors.push(`${egressReason}: ${u}`);
      }
    }
  }
  if (params.baseUrl && !/^https?:\/\//i.test(params.baseUrl.trim())) {
    errors.push('Firecrawl 服务端点 (Base URL) 格式不合法，必须以 http:// 或 https:// 开头');
  }
  return errors;
}

export function validateTaskParams(
  params: TaskParams,
  knownIndustries?: readonly string[],
): string[] {
  const sharedErrors: string[] = [];
  if (
    params.schemaVersion !== undefined &&
    (typeof params.schemaVersion !== 'string' || !params.schemaVersion.trim())
  ) {
    sharedErrors.push('schemaVersion 必须为非空字符串');
  }
  if (
    params.timeoutMs !== undefined &&
    (!Number.isInteger(params.timeoutMs) || params.timeoutMs < 1)
  ) {
    sharedErrors.push('timeoutMs 应为正整数（毫秒）');
  }

  const sourceType = params.sourceType ?? 'cninfo';
  if (sourceType === 'cninfo') {
    return [...sharedErrors, ...validateCninfoParams(params as CninfoTaskParams, knownIndustries)];
  }
  if (sourceType === 'api-connector') {
    return [...sharedErrors, ...validateApiConnectorParams(params as ApiConnectorParams)];
  }
  if (sourceType === 'web-scraper') {
    return [...sharedErrors, ...validateWebScraperParams(params as WebScraperParams)];
  }
  if (sourceType === 'rss') {
    return [...sharedErrors, ...validateRssParams(params as RssTaskParams)];
  }
  return [`不支持的数据源类型: ${(params as any).sourceType}`];
}

export function summarizeTask(params: TaskParams, dryRun: boolean): string {
  if (params.sourceType === 'web-scraper') {
    const prefix = dryRun ? '【预览】' : '';
    return `${prefix}商品价格分析 · ${params.name || '未命名'}`;
  }
  if (params.sourceType === 'rss') {
    return `RSS 采集 · ${params.name || '未命名'}`;
  }
  if (params.sourceType === 'api-connector') {
    const prefix = dryRun ? '【预览】' : '';
    return `${prefix}API采集 · ${params.name || '未命名'}`;
  }
  return summarizeCninfoTask(params, dryRun);
}

export type ScenarioId = 'cninfo-reports' | 'product-price-comparison' | 'weather-api' | 'custom-request';

export interface ScenarioMeta {
  id: ScenarioId;
  title: string;
  badge: string;
  category: 'crawler' | 'api' | 'custom';
  description: string;
}

export type TaskCategory = 'cninfo' | 'product-price' | 'weather' | 'api' | 'rss';

export function getTaskCategory(params: TaskParams): TaskCategory {
  if (params.sourceType === 'web-scraper') {
    return 'product-price';
  }
  if (params.sourceType === 'rss') {
    return 'rss';
  }
  if (params.sourceType === 'api-connector') {
    if (
      params.name.includes('天气') ||
      params.request.url.includes('wttr.in') ||
      params.request.url.includes('open-meteo') ||
      params.extraction.listPath === 'weather'
    ) {
      return 'weather';
    }
    return 'api';
  }
  return 'cninfo';
}

export const CATEGORY_LABELS: Record<
  TaskCategory,
  { label: string; icon: string; chipClass: string }
> = {
  cninfo: { label: 'A股财报', icon: '🏢', chipClass: 'chip-ok' },
  'product-price': { label: '商品标价分析', icon: '🏷️', chipClass: 'chip-accent' },
  weather: { label: '城市气象', icon: '🌤️', chipClass: 'chip-queue' },
  api: { label: '通用API', icon: '🔌', chipClass: 'chip-queue' },
  rss: { label: 'RSS 资讯', icon: '📡', chipClass: 'chip-ok' },
};

export const COLLECTOR_SCENARIOS: readonly ScenarioMeta[] = [
  {
    id: 'product-price-comparison',
    title: '公开商品标价与价格带对比',
    badge: '网页采集 · 分析样板',
    category: 'crawler',
    description: '输入多品牌商品 URL 列表，自动提取商品标价并计算中位数与价格分布，生成对比分析看板。',
  },
  {
    id: 'cninfo-reports',
    title: '巨潮资讯 · A 股财报采集',
    badge: '固化爬虫',
    category: 'crawler',
    description: '官方信息披露平台，批量下载上市公司官方年报、半年报与季报 PDF 原件。',
  },
  {
    id: 'weather-api',
    title: '全国城市天气与气象数据',
    badge: '官方 API',
    category: 'api',
    description: '免鉴权气象数据接口，采集指定城市未来 3 天气温、天气与风向，自动生成 JSON 报表。',
  },
  {
    id: 'custom-request',
    title: '定制新数据采集场景',
    badge: 'AI 协同接入',
    category: 'custom',
    description: '遇到新网站、新业务或拿到新 API 文档？将需求发给 AI，自动编写并固化上架！',
  },
];

export const DEFAULT_WEATHER_CITIES = [
  '北京',
  '上海',
  '广州',
  '深圳',
  '杭州',
  '成都',
  '武汉',
  '西安',
  '南京',
  '重庆',
] as const;

export function createWeatherApiParams(city: string): ApiConnectorParams {
  const cleanCity = city.trim() || '北京';
  return {
    sourceType: 'api-connector',
    name: `${cleanCity}天气数据采集`,
    request: {
      url: `https://wttr.in/${encodeURIComponent(cleanCity)}?format=j1#{{page}}`,
      method: 'GET',
    },
    pagination: {
      type: 'page_number',
      pageParam: 'page',
      startPage: 1,
      pageSize: 3,
      maxPages: 1,
    },
    extraction: {
      listPath: 'weather',
      titlePath: 'date',
      itemKeyPath: 'date',
      datePath: 'date',
    },
    sleepMs: 1000,
  };
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

export function createSampleProductComparisonParams(): WebScraperParams {
  return {
    sourceType: 'web-scraper',
    name: '品牌A/B/C商品标价中位数对比样板',
    urls: [
      'https://brand-a.example/shoes/101',
      'https://brand-a.example/shoes/102',
      'https://brand-a.example/shoes/103',
      'https://brand-b.example/shoes/201',
      'https://brand-b.example/shoes/202',
      'https://brand-b.example/shoes/203',
      'https://brand-c.example/shoes/301',
      'https://brand-c.example/shoes/302',
      'https://brand-c.example/shoes/303',
    ],
    mock: true,
    analyze: true,
    baselineBrand: 'Brand A',
  };
}

