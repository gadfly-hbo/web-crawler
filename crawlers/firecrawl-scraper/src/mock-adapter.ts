import type {
  AcquisitionCapabilities,
  AcquisitionResult,
  ScrapeOptions,
  WebAcquisitionPort
} from './port.js';

export interface MockRule {
  matchUrl: string | RegExp;
  result?: Partial<AcquisitionResult>;
  errorStatus?: number;
  errorMessage?: string;
  delayMs?: number;
}

export class MockAcquisitionAdapter implements WebAcquisitionPort {
  private readonly rules: MockRule[];

  constructor(rules: MockRule[] = []) {
    this.rules = rules;
  }

  getCapabilities(): AcquisitionCapabilities {
    return {
      provider: 'mock_adapter',
      supportsMarkdown: true,
      supportsHtml: true,
      supportsRawHtml: true,
      supportsSearch: true,
      supportsMap: true
    };
  }

  async scrape(options: ScrapeOptions): Promise<AcquisitionResult> {
    const requestedAt = new Date().toISOString();

    // 匹配自定义规则
    for (const rule of this.rules) {
      const isMatch =
        typeof rule.matchUrl === 'string'
          ? options.url.includes(rule.matchUrl)
          : rule.matchUrl.test(options.url);

      if (isMatch) {
        if (rule.delayMs) {
          await new Promise((r) => setTimeout(r, rule.delayMs));
        }

        if (rule.errorStatus) {
          const receivedAt = new Date().toISOString();
          return {
            success: false,
            targetUrl: options.url,
            statusCode: rule.errorStatus,
            requestedAt,
            receivedAt,
            error: {
              code: rule.errorStatus === 429 ? 'RATE_LIMIT_EXCEEDED' : 'SERVER_ERROR',
              message: rule.errorMessage || `Mock HTTP error ${rule.errorStatus}`,
              statusCode: rule.errorStatus,
              retryable: rule.errorStatus === 429 || rule.errorStatus >= 500
            }
          };
        }

        if (rule.result) {
          const receivedAt = new Date().toISOString();
          return {
            success: true,
            targetUrl: options.url,
            statusCode: 200,
            requestedAt,
            receivedAt,
            markdown: '# Mock Title\n\nMock content for testing.',
            html: '<html><body><h1>Mock Title</h1><p>Mock content for testing.</p></body></html>',
            ...rule.result
          };
        }
      }
    }

    // 默认合成数据
    const receivedAt = new Date().toISOString();
    let domain = 'example.com';
    try {
      domain = new URL(options.url).hostname;
    } catch {}

    let brand = 'SampleBrand';
    let price = '299.00';
    let title = `Sample Product - ${domain}`;

    if (options.url.includes('brand-a') || options.url.includes('branda')) {
      brand = 'Brand A';
      if (options.url.includes('101')) price = '199.00';
      else if (options.url.includes('102')) price = '299.00';
      else if (options.url.includes('103')) price = '399.00';
      else price = '299.00';
      title = `Brand A 轻量竞速跑鞋 (${price}元)`;
    } else if (options.url.includes('brand-b') || options.url.includes('brandb')) {
      brand = 'Brand B';
      if (options.url.includes('201')) price = '159.00';
      else if (options.url.includes('202')) price = '259.00';
      else if (options.url.includes('203')) price = '359.00';
      else price = '259.00';
      title = `Brand B 舒适慢跑鞋 (${price}元)`;
    } else if (options.url.includes('brand-c') || options.url.includes('brandc')) {
      brand = 'Brand C';
      if (options.url.includes('301')) price = '239.00';
      else if (options.url.includes('302')) price = '339.00';
      else if (options.url.includes('303')) price = '439.00';
      else price = '339.00';
      title = `Brand C 碳板专业跑鞋 (${price}元)`;
    }

    const mockMarkdown = `# ${title}\n\nBrand: ${brand}\n分类: 运动鞋\n价格: ¥${price}`;
    const mockHtml = `<div class="product"><h1>${title}</h1><span class="brand">${brand}</span><span class="price">¥${price}</span></div>`;

    return {
      success: true,
      targetUrl: options.url,
      finalUrl: options.url,
      statusCode: 200,
      markdown: mockMarkdown,
      html: mockHtml,
      requestedAt,
      receivedAt,
      providerCapturedAt: receivedAt,
      cacheHit: false
    };
  }
}
