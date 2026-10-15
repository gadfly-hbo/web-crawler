import assert from 'node:assert/strict';
import test from 'node:test';
import { BudgetExceededError, BudgetGate } from '../src/budget-gate.js';

test('BudgetGate: 在配额内正常登记与查询使用量', () => {
  const gate = new BudgetGate({
    maxTokens: 5000,
    maxCostUsd: 0.1,
    maxCalls: 5,
  });

  gate.checkAndReserve(1000, 0.01);
  gate.recordUsage({ tokens: 1200, costUsd: 0.012 });

  const usage = gate.getUsage();
  assert.equal(usage.callsMade, 1);
  assert.equal(usage.tokensUsed, 1200);
  assert.equal(usage.costUsdUsed, 0.012);
});

test('BudgetGate: 超出 Token 预算立即抛出 TOKENS_EXCEEDED 熔断', () => {
  const gate = new BudgetGate({
    maxTokens: 3000,
    maxCostUsd: 1.0,
    maxCalls: 10,
  });

  gate.recordUsage({ tokens: 2500 });

  assert.throws(
    () => {
      // 预占 1000 会使得总 token 达到 3500 > 3000
      gate.checkAndReserve(1000);
    },
    (err: any) => {
      return err instanceof BudgetExceededError && err.reason === 'TOKENS_EXCEEDED';
    }
  );
});

test('BudgetGate: 超出调用次数限制立即抛出 CALLS_EXCEEDED 熔断', () => {
  const gate = new BudgetGate({
    maxTokens: 100000,
    maxCostUsd: 1.0,
    maxCalls: 2,
  });

  gate.checkAndReserve(100);
  gate.recordUsage({ tokens: 100 });
  gate.checkAndReserve(100);
  gate.recordUsage({ tokens: 100 });

  // 此时调用次数已达 2，第 3 次调用预检应触发熔断
  assert.throws(
    () => {
      gate.checkAndReserve(100);
    },
    (err: any) => {
      return err instanceof BudgetExceededError && err.reason === 'CALLS_EXCEEDED';
    }
  );
});
