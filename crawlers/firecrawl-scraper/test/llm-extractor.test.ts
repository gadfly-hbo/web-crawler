import assert from 'node:assert/strict';
import test from 'node:test';
import { BudgetGate } from '../src/budget-gate.js';
import { ControlledLlmExtractor, type LlmProvider, type LlmProviderResponse, MockLlmProvider } from '../src/llm-extractor.js';

test('ControlledLlmExtractor: 使用 MockProvider 正常提取并生成证据链', async () => {
  const extractor = new ControlledLlmExtractor({
    provider: new MockLlmProvider(),
  });

  const md = '# 智能手表 Pro\n\nBrand: Brand A\n分类: 智能穿戴\n标价: ¥1,299';
  const res = await extractor.extract({
    url: 'https://brand-a.example/watch',
    markdown: md,
    taskId: 'task_llm_1',
    recordId: 'rec_llm_1',
  });

  assert.equal(res.record.brand, 'Brand A');
  assert.equal(res.record.title, '智能手表 Pro');
  assert.equal(res.record.price, 1299);
  assert.equal(res.record.currency, 'CNY');
  assert.equal(res.record.qualityStatus, 'valid');

  assert.ok(res.evidences.length >= 2);
  const priceEvidence = res.evidences.find((e) => e.field === 'price');
  assert.ok(priceEvidence);
  assert.equal(priceEvidence.value, 1299);
  assert.equal(priceEvidence.extractorType, 'llm');
  assert.ok(priceEvidence.confidence > 0.8);
  assert.equal(priceEvidence.lineStart, 5); // 第 5 行是标价
});

test('ControlledLlmExtractor: 识别模型幻觉 quote（快照中不存在的字串置信度为0）', async () => {
  // 自定义 Provider，输出快照原文中根本不存在的 quote
  class HallucinatingProvider implements LlmProvider {
    async complete(): Promise<LlmProviderResponse> {
      return {
        content: JSON.stringify({
          brand: { value: 'Brand X', quote: '文中根本不存在的品牌词' },
          title: { value: '幻觉商品', quote: '不存在的标题' },
          price: { value: 999, quote: '¥999（原文没有）' },
          currency: { value: 'CNY', quote: null },
          category: { value: '数码', quote: null },
        }),
        usage: { promptTokens: 50, completionTokens: 50, totalTokens: 100 },
      };
    }
  }

  const extractor = new ControlledLlmExtractor({
    provider: new HallucinatingProvider(),
  });

  const md = '# 真实的公开网页\n\n实际内容并不包含任何999字样';
  const res = await extractor.extract({
    url: 'https://brand-x.example/item',
    markdown: md,
  });

  // 核查证据：因为 quote 在 md 中不存在，selectorOrPattern 应该标记为 hallucination_unverified 且置信度为 0
  const priceEvidence = res.evidences.find((e) => e.field === 'price');
  assert.ok(priceEvidence);
  assert.equal(priceEvidence.confidence, 0.0);
  assert.equal(priceEvidence.selectorOrPattern, 'hallucination_unverified');
});

test('ControlledLlmExtractor: 预算超限熔断阻止调用', async () => {
  const gate = new BudgetGate({
    maxTokens: 500, // 极低预算
  });

  const extractor = new ControlledLlmExtractor({
    budgetGate: gate,
  });

  // 1000 字符的内容需要预占约 1000 tokens，必然超限
  await assert.rejects(
    async () => {
      await extractor.extract({
        url: 'https://brand-a.example/item',
        markdown: '# 超长网页 '.repeat(100),
      });
    },
    (err: any) => err.name === 'BudgetExceededError'
  );
});
