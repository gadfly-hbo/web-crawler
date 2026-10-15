/**
 * 通用预算门禁拦截器 (BudgetGate)
 * 严格遵循 fail-closed 架构事实：
 * 在途配额预留、超额立即熔断，杜绝外部 API / 模型调用失控与计费超支。
 */

export interface BudgetConfig {
  maxTokens?: number;
  maxCostUsd?: number;
  maxCalls: number;
}

export interface BudgetUsage {
  tokensUsed: number;
  costUsdUsed: number;
  callsMade: number;
}

export class BudgetExceededError extends Error {
  public readonly reason: 'TOKENS_EXCEEDED' | 'COST_EXCEEDED' | 'CALLS_EXCEEDED';
  public readonly current: number;
  public readonly limit: number;

  constructor(reason: 'TOKENS_EXCEEDED' | 'COST_EXCEEDED' | 'CALLS_EXCEEDED', current: number, limit: number) {
    super(`[BudgetGate] 预算门禁熔断: ${reason} (当前: ${current}, 上限: ${limit})`);
    this.name = 'BudgetExceededError';
    this.reason = reason;
    this.current = current;
    this.limit = limit;
  }
}

export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  maxTokens: 50000,
  maxCostUsd: 0.20,
  maxCalls: 50,
};

export class BudgetGate {
  private readonly config: BudgetConfig;
  private usage: BudgetUsage = {
    tokensUsed: 0,
    costUsdUsed: 0,
    callsMade: 0,
  };

  constructor(customConfig: Partial<BudgetConfig> = {}) {
    this.config = {
      ...DEFAULT_BUDGET_CONFIG,
      ...customConfig,
    };
  }

  /**
   * 检查并在途预占配额（Fail-Closed 门禁）
   */
  public checkAndReserve(estimatedTokens = 1000, estimatedCostUsd = 0.005): void {
    if (this.usage.callsMade + 1 > this.config.maxCalls) {
      throw new BudgetExceededError('CALLS_EXCEEDED', this.usage.callsMade + 1, this.config.maxCalls);
    }
    if (this.config.maxTokens && this.usage.tokensUsed + estimatedTokens > this.config.maxTokens) {
      throw new BudgetExceededError('TOKENS_EXCEEDED', this.usage.tokensUsed + estimatedTokens, this.config.maxTokens);
    }
    if (this.config.maxCostUsd && this.usage.costUsdUsed + estimatedCostUsd > this.config.maxCostUsd) {
      throw new BudgetExceededError('COST_EXCEEDED', this.usage.costUsdUsed + estimatedCostUsd, this.config.maxCostUsd);
    }
  }

  /**
   * 核销并记录实际使用量
   */
  public recordUsage(consumed: { tokens?: number; costUsd?: number } = {}): void {
    const tokens = consumed.tokens ?? 0;
    const cost = consumed.costUsd ?? (tokens / 1000) * 0.002;
    this.usage.callsMade += 1;
    this.usage.tokensUsed += tokens;
    this.usage.costUsdUsed += cost;

    if (this.config.maxTokens && this.usage.tokensUsed > this.config.maxTokens) {
      throw new BudgetExceededError('TOKENS_EXCEEDED', this.usage.tokensUsed, this.config.maxTokens);
    }
    if (this.config.maxCostUsd && this.usage.costUsdUsed > this.config.maxCostUsd) {
      throw new BudgetExceededError('COST_EXCEEDED', this.usage.costUsdUsed, this.config.maxCostUsd);
    }
  }

  public getUsage(): Readonly<BudgetUsage> {
    return { ...this.usage };
  }

  public getConfig(): Readonly<BudgetConfig> {
    return { ...this.config };
  }

  public reset(): void {
    this.usage = {
      tokensUsed: 0,
      costUsdUsed: 0,
      callsMade: 0,
    };
  }
}
