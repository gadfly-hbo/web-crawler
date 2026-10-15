/**
 * 网页采集端口核心契约 (WebAcquisitionPort)
 * 隔离 Firecrawl Cloud、自托管与本地 Mock 适配器差异
 */

export type ScrapeFormat = 'markdown' | 'html' | 'rawHtml';

export type FreshnessPolicy = 'fresh_when_supported' | 'prefer_cache';

export interface ScrapeOptions {
  url: string;
  formats?: ScrapeFormat[];
  timeoutMs?: number;
  freshness?: FreshnessPolicy;
  headers?: Record<string, string>;
  maxRetries?: number;
}

export type AcquisitionErrorCode =
  | 'RATE_LIMIT_EXCEEDED'
  | 'ACCESS_DENIED'
  | 'PAGE_NOT_FOUND'
  | 'SERVER_ERROR'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'INVALID_URL'
  | 'UNKNOWN_ERROR';

export interface AcquisitionErrorDetails {
  code: AcquisitionErrorCode;
  message: string;
  statusCode?: number;
  retryable: boolean;
}

export interface AcquisitionResult {
  success: boolean;
  targetUrl: string;
  finalUrl?: string;
  statusCode: number;
  markdown?: string;
  html?: string;
  rawHtml?: string;
  requestedAt: string;
  receivedAt: string;
  providerCapturedAt?: string;
  cacheHit?: boolean;
  error?: AcquisitionErrorDetails;
}

export interface AcquisitionCapabilities {
  provider: 'firecrawl_cloud' | 'firecrawl_self_hosted' | 'mock_adapter';
  supportsMarkdown: boolean;
  supportsHtml: boolean;
  supportsRawHtml: boolean;
  supportsSearch: boolean;
  supportsMap: boolean;
}

export interface WebAcquisitionPort {
  getCapabilities(): AcquisitionCapabilities;
  scrape(options: ScrapeOptions): Promise<AcquisitionResult>;
}
