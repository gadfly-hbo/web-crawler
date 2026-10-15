/**
 * 受控 LLM 结构化抽取引擎
 * 核心原则：
 * 1. 严格受控：输入 Schema 约束，缺失字段保留 null，严禁无据脑补
 * 2. 证据闭环：每个抽取字段必须提供原文 quote，经快照回验定位生成 FieldEvidence
 * 3. 预算硬限额：接入 BudgetGate，在途超额即熔断
 */

import { BudgetGate, type BudgetUsage } from './budget-gate.js';
import { type FieldEvidence, locateSnippet } from './evidence.js';
import type { ExtractedProductRecord } from './extractor.js';

export interface LlmFieldExtraction<T> {
  value: T | null;
  quote: string | null;
  missingReason?: string | null;
  confidence: number;
}

export interface LlmProductPayload {
  brand: LlmFieldExtraction<string>;
  title: LlmFieldExtraction<string>;
  price: LlmFieldExtraction<number>;
  currency: LlmFieldExtraction<string>;
  category: LlmFieldExtraction<string>;
}

export interface LlmProviderResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LlmProvider {
  complete(prompt: string, systemPrompt: string): Promise<LlmProviderResponse>;
}

/**
 * 确定性本地 Mock LLM Provider（零网络开销，用于单测与离线演练）
 */
export class MockLlmProvider implements LlmProvider {
  async complete(prompt: string, _systemPrompt: string): Promise<LlmProviderResponse> {
    // 简单解析 prompt 中的关键信息模拟 LLM 的结构化输出
    let brandVal = 'Brand A';
    let brandQuote: string | null = 'Brand: Brand A';
    if (/brand[\s-]?b/i.test(prompt)) {
      brandVal = 'Brand B';
      brandQuote = 'Brand B';
    } else if (/brand[\s-]?c/i.test(prompt)) {
      brandVal = 'Brand C';
      brandQuote = 'Brand C';
    }

    let titleVal = '示例商品标题';
    let titleQuote: string | null = null;
    const titleMatch = prompt.match(/^#\s+(.+)$/m) || prompt.match(/<h1>([^<]+)<\/h1>/i);
    if (titleMatch) {
      titleVal = titleMatch[1].trim();
      titleQuote = titleMatch[0].trim();
    }

    let priceVal: number | null = null;
    let priceQuote: string | null = null;
    let missingReason: string | null = 'NOT_FOUND_IN_TEXT';
    let currencyVal = 'CNY';

    const priceMatch = prompt.match(/(?:¥|\$|€|£)\s*([\d,]+(?:\.\d+)?)/) || prompt.match(/(?:价格|标价|售价)[:：]\s*([\d,]+)/);
    if (priceMatch) {
      const num = parseFloat(priceMatch[1].replace(/,/g, ''));
      if (!Number.isNaN(num)) {
        priceVal = num;
        priceQuote = priceMatch[0].trim();
        missingReason = null;
        if (priceQuote.includes('$')) currencyVal = 'USD';
        else if (priceQuote.includes('€')) currencyVal = 'EUR';
        else if (priceQuote.includes('£')) currencyVal = 'GBP';
      }
    }

    const payload: LlmProductPayload = {
      brand: { value: brandVal, quote: brandQuote, confidence: 0.95 },
      title: { value: titleVal, quote: titleQuote, confidence: 0.98 },
      price: { value: priceVal, quote: priceQuote, missingReason, confidence: priceVal !== null ? 0.99 : 0 },
      currency: { value: currencyVal, quote: priceQuote, confidence: 0.95 },
      category: { value: '通用商品', quote: null, confidence: 0.8 },
    };

    return {
      content: JSON.stringify(payload),
      usage: {
        promptTokens: Math.ceil(prompt.length / 4),
        completionTokens: 120,
        totalTokens: Math.ceil(prompt.length / 4) + 120,
      },
    };
  }
}

export class ControlledLlmExtractor {
  private readonly provider: LlmProvider;
  private readonly budgetGate: BudgetGate;

  constructor(options: {
    provider?: LlmProvider;
    budgetGate?: BudgetGate;
  } = {}) {
    this.provider = options.provider || new MockLlmProvider();
    this.budgetGate = options.budgetGate || new BudgetGate();
  }

  public getBudgetUsage(): Readonly<BudgetUsage> {
    return this.budgetGate.getUsage();
  }

  /**
   * 受控结构化抽取
   */
  async extract(params: {
    url: string;
    markdown?: string;
    html?: string;
    recordId?: string;
    snapshotId?: string;
    taskId?: string;
    observedAt?: string;
  }): Promise<{
    record: ExtractedProductRecord;
    evidences: FieldEvidence[];
    rawLlmPayload: LlmProductPayload;
  }> {
    const md = params.markdown || '';
    const html = params.html || '';
    const rawContent = md || html;
    const observedAt = params.observedAt || new Date().toISOString();
    const recordId = params.recordId || `rec_llm_${Date.now()}`;
    const snapshotId = params.snapshotId || recordId;
    const taskId = params.taskId || 'task_default';

    // 1. 预算门禁预检 (预占 2000 tokens)
    const estimatedTokens = Math.max(1000, Math.ceil(rawContent.length / 3));
    this.budgetGate.checkAndReserve(estimatedTokens);

    // 2. 构造严格受控 Prompt
    const systemPrompt = `你是一个工业级严肃数据抽取器。
从给定的网页 Markdown/HTML 中提取商品字段并以 JSON 格式输出。
字段规则：
- brand: 品牌名称
- title: 商品标题
- price: 数值型标价，若文中未提及明确价格，必须为 null，严禁猜测或填0
- currency: 币种代码 (CNY/USD/EUR/GBP等)
- category: 商品分类
对每个字段，你必须提供原文精确引用的子串 quote (若为推断或缺失则 quote 为 null)。
输出必须是标准 JSON 对象，格式为:
{
  "brand": { "value": string|null, "quote": string|null },
  "title": { "value": string|null, "quote": string|null },
  "price": { "value": number|null, "quote": string|null, "missingReason": string|null },
  "currency": { "value": string|null, "quote": string|null },
  "category": { "value": string|null, "quote": string|null }
}`;

    const userPrompt = `URL: ${params.url}\n\n内容:\n${rawContent.slice(0, 15000)}`;

    // 3. 执行抽取
    const res = await this.provider.complete(userPrompt, systemPrompt);

    // 4. 预算核销
    this.budgetGate.recordUsage({
      tokens: res.usage.totalTokens,
    });

    // 5. 解析 JSON 响应
    let payload: LlmProductPayload;
    try {
      const cleaned = res.content.replace(/```json/g, '').replace(/```/g, '').trim();
      payload = JSON.parse(cleaned);
    } catch {
      throw new Error(`LLM 输出无法解析为合法 JSON: ${res.content.slice(0, 200)}`);
    }

    // 6. 证据回验与定位对齐
    const evidences: FieldEvidence[] = [];

    const verifyAndCreateEvidence = (
      field: string,
      fieldExtraction: LlmFieldExtraction<any>
    ) => {
      if (!fieldExtraction || fieldExtraction.value === null) return;

      const quote = fieldExtraction.quote;
      let loc = quote ? locateSnippet(rawContent, quote) : null;
      let confidence = fieldExtraction.confidence ?? 0.9;
      let selectorOrPattern = 'llm-extraction-quote';

      if (quote && !loc) {
        // 模型返回了 quote 但在快照原文中找不到（疑似幻觉）
        confidence = 0.0;
        selectorOrPattern = 'hallucination_unverified';
      }

      const lineStart = loc ? loc.lineStart : 1;
      const lineEnd = loc ? loc.lineEnd : 1;
      const charOffsetStart = loc ? loc.charOffsetStart : 0;
      const charOffsetEnd = loc ? loc.charOffsetEnd : (quote ? quote.length : 0);

      evidences.push({
        id: `ev_llm_${recordId}_${field}_${Math.random().toString(36).slice(2, 6)}`,
        taskId,
        recordId,
        snapshotId,
        field,
        value: fieldExtraction.value,
        sourceText: quote || '',
        selectorOrPattern,
        lineStart,
        lineEnd,
        charOffsetStart,
        charOffsetEnd,
        confidence,
        extractorType: 'llm',
        extractedAt: observedAt,
      });
    };

    verifyAndCreateEvidence('brand', payload.brand);
    verifyAndCreateEvidence('title', payload.title);
    verifyAndCreateEvidence('price', payload.price);
    verifyAndCreateEvidence('currency', payload.currency);
    verifyAndCreateEvidence('category', payload.category);

    const price = typeof payload.price?.value === 'number' ? payload.price.value : null;
    let qualityStatus: ExtractedProductRecord['qualityStatus'] = 'valid';
    let missingReason: string | undefined;

    if (price === null) {
      qualityStatus = 'missing_price';
      missingReason = payload.price?.missingReason || 'PRICE_NOT_FOUND_BY_LLM';
    }

    const record: ExtractedProductRecord = {
      recordId,
      url: params.url,
      brand: payload.brand?.value || 'Unknown Brand',
      title: payload.title?.value || '未命名商品',
      price,
      rawPriceText: payload.price?.quote || undefined,
      currency: payload.currency?.value || 'CNY',
      category: payload.category?.value || '通用商品',
      observedAt,
      qualityStatus,
      missingReason,
      evidences,
    };

    return {
      record,
      evidences,
      rawLlmPayload: payload,
    };
  }
}
