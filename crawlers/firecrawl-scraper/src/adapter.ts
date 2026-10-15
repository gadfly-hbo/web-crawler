import type {
  AcquisitionCapabilities,
  AcquisitionErrorCode,
  AcquisitionResult,
  ScrapeOptions,
  WebAcquisitionPort
} from './port.js';

export interface FirecrawlAdapterConfig {
  apiKey?: string;
  baseUrl?: string;
  isSelfHosted?: boolean;
}

export class FirecrawlAdapter implements WebAcquisitionPort {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly isSelfHosted: boolean;

  constructor(config: FirecrawlAdapterConfig = {}) {
    this.apiKey = config.apiKey || process.env.FIRECRAWL_API_KEY;
    this.baseUrl = (config.baseUrl || process.env.FIRECRAWL_BASE_URL || 'https://api.firecrawl.dev').replace(/\/+$/, '');
    this.isSelfHosted = config.isSelfHosted ?? !!process.env.FIRECRAWL_BASE_URL;
  }

  getCapabilities(): AcquisitionCapabilities {
    return {
      provider: this.isSelfHosted ? 'firecrawl_self_hosted' : 'firecrawl_cloud',
      supportsMarkdown: true,
      supportsHtml: true,
      supportsRawHtml: true,
      supportsSearch: !this.isSelfHosted, // 自托管默认不带外部搜索服务
      supportsMap: true
    };
  }

  private mapStatusCodeToErrorCode(status: number): AcquisitionErrorCode {
    if (status === 429) return 'RATE_LIMIT_EXCEEDED';
    if (status === 401 || status === 403) return 'ACCESS_DENIED';
    if (status === 404) return 'PAGE_NOT_FOUND';
    if (status >= 500) return 'SERVER_ERROR';
    return 'UNKNOWN_ERROR';
  }

  async scrape(options: ScrapeOptions): Promise<AcquisitionResult> {
    const requestedAt = new Date().toISOString();
    const formats = options.formats || ['markdown', 'html'];
    const timeoutMs = options.timeoutMs || 30000;
    const maxRetries = options.maxRetries ?? 1;

    let attempt = 0;
    let lastError: Error | null = null;
    let lastStatusCode = 0;

    while (attempt <= maxRetries) {
      attempt++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        };

        if (this.apiKey) {
          headers.Authorization = `Bearer ${this.apiKey}`;
        }

        const endpoint = `${this.baseUrl}/v1/scrape`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            url: options.url,
            formats
          }),
          signal: controller.signal
        });

        clearTimeout(timer);
        lastStatusCode = res.status;
        const receivedAt = new Date().toISOString();

        if (!res.ok) {
          const errorText = await res.text().catch(() => '');
          const code = this.mapStatusCodeToErrorCode(res.status);
          const retryable = code === 'RATE_LIMIT_EXCEEDED' || code === 'SERVER_ERROR';

          if (retryable && attempt <= maxRetries) {
            await new Promise((r) => setTimeout(r, 1000 * attempt));
            continue;
          }

          return {
            success: false,
            targetUrl: options.url,
            statusCode: res.status,
            requestedAt,
            receivedAt,
            error: {
              code,
              message: `Firecrawl API responded with ${res.status}: ${errorText.slice(0, 200)}`,
              statusCode: res.status,
              retryable
            }
          };
        }

        const data = (await res.json()) as {
          success?: boolean;
          data?: {
            markdown?: string;
            html?: string;
            rawHtml?: string;
            metadata?: {
              sourceURL?: string;
              statusCode?: number;
              title?: string;
            };
          };
          error?: string;
        };

        if (data.success === false || data.error) {
          return {
            success: false,
            targetUrl: options.url,
            statusCode: lastStatusCode || 400,
            requestedAt,
            receivedAt,
            error: {
              code: 'UNKNOWN_ERROR',
              message: data.error || 'Firecrawl scrape failed',
              statusCode: lastStatusCode || 400,
              retryable: false
            }
          };
        }

        return {
          success: true,
          targetUrl: options.url,
          finalUrl: data.data?.metadata?.sourceURL || options.url,
          statusCode: data.data?.metadata?.statusCode || 200,
          markdown: data.data?.markdown,
          html: data.data?.html,
          rawHtml: data.data?.rawHtml,
          requestedAt,
          receivedAt,
          providerCapturedAt: receivedAt
        };
      } catch (err: unknown) {
        clearTimeout(timer);
        lastError = err instanceof Error ? err : new Error(String(err));

        const isTimeout = (err as { name?: string }).name === 'AbortError';
        if (attempt <= maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }

        const receivedAt = new Date().toISOString();
        return {
          success: false,
          targetUrl: options.url,
          statusCode: 0,
          requestedAt,
          receivedAt,
          error: {
            code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
            message: lastError.message,
            retryable: true
          }
        };
      }
    }

    const receivedAt = new Date().toISOString();
    return {
      success: false,
      targetUrl: options.url,
      statusCode: lastStatusCode,
      requestedAt,
      receivedAt,
      error: {
        code: 'UNKNOWN_ERROR',
        message: lastError ? lastError.message : 'Exceeded maximum retries',
        retryable: false
      }
    };
  }
}
