import type { DeliveryFieldSchema } from 'data-governance/manifest';

export * from 'data-governance/manifest';

/**
 * 生成商品标价分析的标准数据模式 (Schema)
 */
export function generateProductDatasetSchema(): DeliveryFieldSchema[] {
  return [
    { name: 'recordId', type: 'string', description: '样本记录全局唯一标识', nullable: false },
    { name: 'url', type: 'string', description: '来源公开商品网页 URL', nullable: false },
    { name: 'brand', type: 'string', description: '商品归属品牌', nullable: false },
    { name: 'title', type: 'string', description: '商品页面展示标题', nullable: false },
    { name: 'price', type: 'number', description: '清洗后的数值型标价 (标价≠成交价)', nullable: true },
    { name: 'currency', type: 'string', description: '标价币种代码 (CNY/USD等)', nullable: false },
    { name: 'category', type: 'string', description: '商品所属品类', nullable: false },
    { name: 'observedAt', type: 'string', description: '观察抓取 ISO 时间戳', nullable: false },
    { name: 'qualityStatus', type: 'string', description: '数据质量状态: valid/missing_price/invalid_price', nullable: false },
    { name: 'missingReason', type: 'string', description: '缺失或无效原因', nullable: true },
  ];
}
