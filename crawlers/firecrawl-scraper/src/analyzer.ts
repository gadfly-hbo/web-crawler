import type { ExtractedProductRecord } from './extractor.js';

export interface BrandPriceSummary {
  brand: string;
  validSampleCount: number;
  missingSampleCount: number;
  currency: string;
  minPrice: number;
  maxPrice: number;
  medianPrice: number;
  avgPrice: number;
  relativeDiffToBaselinePercent?: number; // 相对基准品牌的中位数差异百分比
}

export interface PriceDistributionBucket {
  rangeLabel: string;
  min: number;
  max: number;
  count: number;
  percentage: number;
}

export interface PriceAnalysisReport {
  schema_version: '1.0';
  analyzedAt: string;
  totalRecords: number;
  validRecords: number;
  baselineBrand?: string;
  brandSummaries: BrandPriceSummary[];
  distributionBuckets: PriceDistributionBucket[];
  observationFacts: string[];
  caveatsAndLimits: string[];
}

export class ProductPriceAnalyzer {
  /**
   * 计算一组数值的中位数
   */
  static calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 !== 0) {
      return sorted[mid];
    }
    return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
  }

  /**
   * 执行完整的商品标价与中位数对比分析
   */
  static analyze(records: ExtractedProductRecord[], baselineBrand = 'Brand A'): PriceAnalysisReport {
    const validRecords = records.filter((r) => r.qualityStatus === 'valid' && r.price !== null);
    const analyzedAt = new Date().toISOString();

    // 1. 按品牌分组聚合
    const brandMap = new Map<string, { validPrices: number[]; missingCount: number; currency: string }>();

    for (const record of records) {
      if (!brandMap.has(record.brand)) {
        brandMap.set(record.brand, {
          validPrices: [],
          missingCount: 0,
          currency: record.currency || 'CNY'
        });
      }
      const entry = brandMap.get(record.brand)!;
      if (record.qualityStatus === 'valid' && record.price !== null) {
        entry.validPrices.push(record.price);
      } else {
        entry.missingCount++;
      }
    }

    const brandSummaries: BrandPriceSummary[] = [];

    for (const [brand, data] of brandMap.entries()) {
      const prices = data.validPrices;
      const count = prices.length;
      if (count > 0) {
        const sorted = [...prices].sort((a, b) => a - b);
        const minPrice = sorted[0];
        const maxPrice = sorted[sorted.length - 1];
        const medianPrice = ProductPriceAnalyzer.calculateMedian(sorted);
        const sum = sorted.reduce((acc, v) => acc + v, 0);
        const avgPrice = Math.round((sum / count) * 100) / 100;

        brandSummaries.push({
          brand,
          validSampleCount: count,
          missingSampleCount: data.missingCount,
          currency: data.currency,
          minPrice,
          maxPrice,
          medianPrice,
          avgPrice
        });
      } else {
        brandSummaries.push({
          brand,
          validSampleCount: 0,
          missingSampleCount: data.missingCount,
          currency: data.currency,
          minPrice: 0,
          maxPrice: 0,
          medianPrice: 0,
          avgPrice: 0
        });
      }
    }

    // 2. 计算相对基准品牌的差异
    const baseline = brandSummaries.find((b) => b.brand.toLowerCase() === baselineBrand.toLowerCase());
    if (baseline && baseline.medianPrice > 0) {
      for (const summary of brandSummaries) {
        if (summary.brand === baseline.brand) {
          summary.relativeDiffToBaselinePercent = 0;
        } else if (summary.medianPrice > 0) {
          // (target / baseline - 1) * 100%
          const diff = ((summary.medianPrice / baseline.medianPrice - 1) * 100);
          summary.relativeDiffToBaselinePercent = Math.round(diff * 10) / 10;
        }
      }
    }

    // 3. 价格带分布计算
    const allValidPrices = validRecords.map((r) => r.price!);
    const bucketsDef = [
      { label: '< 200', min: 0, max: 199.99 },
      { label: '200 - 299', min: 200, max: 299.99 },
      { label: '300 - 399', min: 300, max: 399.99 },
      { label: '≥ 400', min: 400, max: Number.POSITIVE_INFINITY }
    ];

    const distributionBuckets: PriceDistributionBucket[] = bucketsDef.map((b) => {
      const matchCount = allValidPrices.filter((p) => p >= b.min && p <= b.max).length;
      const percentage =
        allValidPrices.length > 0 ? Math.round((matchCount / allValidPrices.length) * 1000) / 10 : 0;
      return {
        rangeLabel: b.label,
        min: b.min,
        max: b.max,
        count: matchCount,
        percentage
      };
    });

    // 4. 事实与限制说明（严禁主观幻觉）
    const observationFacts: string[] = [
      `共采集并清洗 ${records.length} 个商品页面，有效合格样本 ${validRecords.length} 条。`
    ];
    if (baseline) {
      observationFacts.push(
        `基准品牌 ${baseline.brand} 的标价中位数为 ${baseline.medianPrice} ${baseline.currency}。`
      );
    }

    const caveatsAndLimits: string[] = [
      '网页标价不等于最终成交价，亦不包含优惠券、会员折扣或满减促销。',
      '采集样本仅代表本次采集页面，不等于全网全渠道全量商品。',
      '未进行跨品牌完全同款对标匹配，标价差异受配置与规格影响。',
      '数据严禁直接推导为销量、市场占有率或降价策略。'
    ];

    return {
      schema_version: '1.0',
      analyzedAt,
      totalRecords: records.length,
      validRecords: validRecords.length,
      baselineBrand,
      brandSummaries,
      distributionBuckets,
      observationFacts,
      caveatsAndLimits
    };
  }

  /**
   * 将品牌对比分析导出为 CSV
   */
  static exportSummaryCsv(report: PriceAnalysisReport): string {
    const headers = [
      '品牌',
      '合格样本数',
      '缺失样本数',
      '币种',
      '标价最小值',
      '标价最大值',
      '标价中位数',
      '标价平均值',
      '相对基准差异(%)'
    ];
    const rows = report.brandSummaries.map((b) => [
      b.brand,
      b.validSampleCount,
      b.missingSampleCount,
      b.currency,
      b.minPrice,
      b.maxPrice,
      b.medianPrice,
      b.avgPrice,
      b.relativeDiffToBaselinePercent !== undefined ? `${b.relativeDiffToBaselinePercent}%` : '-'
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }
}
