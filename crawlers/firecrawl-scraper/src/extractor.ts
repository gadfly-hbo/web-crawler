/**
 * 网页内容规则提取引擎与口径规范化器
 * 优先采用 CSS/Regex 确定性规则提取，输出结构化数据与字段级证据定位
 */

import { type ExtractorType, type FieldEvidence, locateSnippet } from './evidence.js';

export interface ExtractedProductRecord {
  recordId: string;
  url: string;
  brand: string;
  title: string;
  price: number | null;
  rawPriceText?: string;
  currency: string;
  category: string;
  observedAt: string;
  qualityStatus: 'valid' | 'missing_price' | 'invalid_price';
  missingReason?: string;
  evidences?: FieldEvidence[];
}

export interface ProductExtractionRule {
  brandRegex?: RegExp;
  titleRegex?: RegExp;
  priceRegex?: RegExp;
  categoryRegex?: RegExp;
  defaultCurrency?: string;
}

export type ExtractResult = ExtractedProductRecord & {
  record: ExtractedProductRecord;
  evidences: FieldEvidence[];
};

export class ProductPriceExtractor {
  private readonly rule: ProductExtractionRule;

  constructor(customRule: ProductExtractionRule = {}) {
    this.rule = {
      defaultCurrency: 'CNY',
      ...customRule,
    };
  }

  /**
   * 清洗价格字符串并转为浮点数
   */
  static parsePrice(rawPrice: string): { price: number | null; currency: string } {
    const trimmed = rawPrice.trim();
    let currency = 'CNY';
    if (trimmed.includes('$') || /USD/i.test(trimmed)) {
      currency = 'USD';
    } else if (trimmed.includes('€') || /EUR/i.test(trimmed)) {
      currency = 'EUR';
    } else if (trimmed.includes('£') || /GBP/i.test(trimmed)) {
      currency = 'GBP';
    }

    // 匹配数值部分，支持逗号千分位
    const numMatch = trimmed.match(/([\d,]+(?:\.\d+)?)/);
    if (!numMatch) {
      return { price: null, currency };
    }

    const cleanNumStr = numMatch[1].replace(/,/g, '');
    const num = parseFloat(cleanNumStr);
    return {
      price: Number.isNaN(num) || num < 0 ? null : num,
      currency,
    };
  }

  /**
   * 从 URL 中推断品牌
   */
  static inferBrandFromUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      if (host.includes('brand-a') || host.includes('branda')) return 'Brand A';
      if (host.includes('brand-b') || host.includes('brandb')) return 'Brand B';
      if (host.includes('brand-c') || host.includes('brandc')) return 'Brand C';

      const parts = host.split('.');
      if (parts.length >= 2) {
        const name = parts[parts.length - 2];
        return name.charAt(0).toUpperCase() + name.slice(1);
      }
      return host;
    } catch {
      return 'Unknown Brand';
    }
  }

  /**
   * 从快照内容中提取结构化商品记录并生成字段级证据
   */
  extract(params: {
    recordId?: string;
    snapshotId?: string;
    taskId?: string;
    url: string;
    markdown?: string;
    html?: string;
    observedAt?: string;
  }): ExtractResult {
    const md = params.markdown || '';
    const html = params.html || '';
    // 主要快照载荷，优先使用 markdown，若无则使用 html
    const primaryDoc = md.length > 0 ? md : html;
    const content = `${md}\n${html}`;
    const observedAt = params.observedAt || new Date().toISOString();
    const recordId = params.recordId || `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const snapshotId = params.snapshotId || recordId;
    const taskId = params.taskId || 'task_default';

    const evidences: FieldEvidence[] = [];

    const createEvidence = (
      field: string,
      value: any,
      sourceSnippet: string,
      selectorOrPattern: string,
      extractorType: ExtractorType,
      confidence: number
    ): FieldEvidence => {
      // 优先在 primaryDoc 定位，若找不到在 content 中定位
      let loc = locateSnippet(primaryDoc, sourceSnippet);
      if (!loc) {
        loc = locateSnippet(content, sourceSnippet);
      }

      const lineStart = loc ? loc.lineStart : 1;
      const lineEnd = loc ? loc.lineEnd : 1;
      const charOffsetStart = loc ? loc.charOffsetStart : 0;
      const charOffsetEnd = loc ? loc.charOffsetEnd : sourceSnippet.length;

      return {
        id: `ev_${recordId}_${field}_${Math.random().toString(36).slice(2, 6)}`,
        taskId,
        recordId,
        snapshotId,
        field,
        value,
        sourceText: sourceSnippet,
        selectorOrPattern,
        lineStart,
        lineEnd,
        charOffsetStart,
        charOffsetEnd,
        confidence,
        extractorType,
        extractedAt: observedAt,
      };
    };

    // 1. 提取品牌
    let brand = ProductPriceExtractor.inferBrandFromUrl(params.url);
    let brandSource = params.url;
    let brandPattern = 'url-hostname';
    let brandType: ExtractorType = 'regex';

    if (this.rule.brandRegex) {
      const match = content.match(this.rule.brandRegex);
      if (match && match[1]) {
        brand = match[1].trim();
        brandSource = match[0];
        brandPattern = this.rule.brandRegex.toString();
      }
    } else {
      const brandMatch = content.match(/(?:品牌|Brand)[:：]\s*([^\n<]+)/i);
      if (brandMatch && brandMatch[1]) {
        brand = brandMatch[1].trim();
        brandSource = brandMatch[0];
        brandPattern = '/(?:品牌|Brand)[:：]\\s*([^\\n<]+)/i';
      }
    }
    evidences.push(createEvidence('brand', brand, brandSource, brandPattern, brandType, 0.95));

    // 2. 提取标题
    let title = '未命名商品';
    let titleSource = '';
    let titlePattern = '';
    let titleType: ExtractorType = 'css';

    if (this.rule.titleRegex) {
      const match = content.match(this.rule.titleRegex);
      if (match && match[1]) {
        title = match[1].trim();
        titleSource = match[0];
        titlePattern = this.rule.titleRegex.toString();
        titleType = 'regex';
      }
    } else {
      // 优先从 Markdown 一级标题提取
      const h1MdMatch = md.match(/^#\s+(.+)$/m);
      if (h1MdMatch && h1MdMatch[1]) {
        title = h1MdMatch[1].trim();
        titleSource = h1MdMatch[0];
        titlePattern = '/^#\\s+(.+)$/m';
        titleType = 'regex';
      } else {
        const h1HtmlMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        if (h1HtmlMatch && h1HtmlMatch[1]) {
          title = h1HtmlMatch[1].trim();
          titleSource = h1HtmlMatch[0];
          titlePattern = 'h1';
          titleType = 'css';
        }
      }
    }
    if (titleSource) {
      evidences.push(createEvidence('title', title, titleSource, titlePattern, titleType, 0.98));
    }

    // 3. 提取品类
    let category = '通用商品';
    let catSource = '';
    let catPattern = '';
    let catType: ExtractorType = 'regex';

    if (this.rule.categoryRegex) {
      const match = content.match(this.rule.categoryRegex);
      if (match && match[1]) {
        category = match[1].trim();
        catSource = match[0];
        catPattern = this.rule.categoryRegex.toString();
      }
    } else {
      const catMatch = content.match(/(?:分类|品类|Category)[:：]\s*([^\n<]+)/i);
      if (catMatch && catMatch[1]) {
        category = catMatch[1].trim();
        catSource = catMatch[0];
        catPattern = '/(?:分类|品类|Category)[:：]\\s*([^\\n<]+)/i';
      }
    }
    if (catSource) {
      evidences.push(createEvidence('category', category, catSource, catPattern, catType, 0.9));
    }

    // 4. 提取价格
    let rawPriceText: string | undefined;
    let price: number | null = null;
    let currency = this.rule.defaultCurrency || 'CNY';
    let priceSource = '';
    let pricePattern = '';
    let priceType: ExtractorType = 'regex';

    if (this.rule.priceRegex) {
      const match = content.match(this.rule.priceRegex);
      if (match && match[1]) {
        rawPriceText = match[1];
        priceSource = match[0];
        pricePattern = this.rule.priceRegex.toString();
        const parsed = ProductPriceExtractor.parsePrice(rawPriceText);
        price = parsed.price;
        currency = parsed.currency;
      }
    } else {
      const priceHtmlMatch = html.match(/class=["'][^"']*price[^"']*["'][^>]*>([^<]+)<\//i);
      if (priceHtmlMatch && priceHtmlMatch[1]) {
        rawPriceText = priceHtmlMatch[1].trim();
        priceSource = priceHtmlMatch[0];
        pricePattern = '.price';
        priceType = 'css';
      } else {
        const priceTextMatch = content.match(/(?:标价|售价|价格|Price)[:：]?\s*([¥$€£]?\s*[\d,]+(?:\.\d+)?)/i);
        if (priceTextMatch && priceTextMatch[1]) {
          rawPriceText = priceTextMatch[1].trim();
          priceSource = priceTextMatch[0];
          pricePattern = '/(?:标价|售价|价格|Price)[:：]?\\s*([¥$€£]?\\s*[\\d,]+(?:\\.\\d+)?)/i';
          priceType = 'regex';
        } else {
          const symbolMatch = content.match(/([¥$€£]\s*[\d,]+(?:\.\d+)?)/);
          if (symbolMatch && symbolMatch[1]) {
            rawPriceText = symbolMatch[1].trim();
            priceSource = symbolMatch[0];
            pricePattern = '/([¥$€£]\\s*[\\d,]+(?:\\.\\d+)?)/';
            priceType = 'regex';
          }
        }
      }

      if (rawPriceText) {
        const parsed = ProductPriceExtractor.parsePrice(rawPriceText);
        price = parsed.price;
        if (parsed.currency) currency = parsed.currency;
      }
    }

    if (priceSource && price !== null) {
      evidences.push(createEvidence('price', price, priceSource, pricePattern, priceType, 0.99));
      evidences.push(createEvidence('currency', currency, priceSource, pricePattern, priceType, 0.95));
    }

    // 5. 质量校验与缺失分类
    let qualityStatus: ExtractedProductRecord['qualityStatus'] = 'valid';
    let missingReason: string | undefined;

    if (!rawPriceText) {
      qualityStatus = 'missing_price';
      missingReason = 'PRICE_NOT_FOUND_IN_SNAPSHOT';
    } else if (price === null) {
      qualityStatus = 'invalid_price';
      missingReason = 'PRICE_CANNOT_BE_PARSED_AS_NUMBER';
    }

    const record: ExtractedProductRecord = {
      recordId,
      url: params.url,
      brand,
      title,
      price,
      rawPriceText,
      currency,
      category,
      observedAt,
      qualityStatus,
      missingReason,
      evidences,
    };

    return Object.assign({}, record, { record, evidences });
  }
}
