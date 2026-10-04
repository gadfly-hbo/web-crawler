/**
 * 巨潮公告检索支持的行业筛选项：证监会行业门类，仅此 19 类粒度
 * （取自巨潮高级检索页下拉框；曾有的大类/中类筛选已下线，实测 trade 传大类名返回 0 结果）。
 */

export const INDUSTRY_CATEGORIES = [
  '农、林、牧、渔业',
  '采矿业',
  '制造业',
  '电力、热力、燃气及水生产和供应业',
  '建筑业',
  '批发和零售业',
  '交通运输、仓储和邮政业',
  '住宿和餐饮业',
  '信息传输、软件和信息技术服务业',
  '金融业',
  '房地产业',
  '租赁和商务服务业',
  '科学研究和技术服务业',
  '水利、环境和公共设施管理业',
  '居民服务、修理和其他服务业',
  '教育',
  '卫生和社会工作',
  '文化、体育和娱乐业',
  '综合',
] as const;

function normalize(s: string): string {
  return s.replace(/[、，,．.\s]/g, '');
}

export function listIndustries(): readonly string[] {
  return INDUSTRY_CATEGORIES;
}

/** 关键词 -> 门类全称：精确匹配优先，其次唯一包含匹配，多候选/未命中时报错并给出可选项。 */
export function matchIndustry(keyword: string): string {
  const kw = normalize(keyword);
  const exact = INDUSTRY_CATEGORIES.find((c) => normalize(c) === kw);
  if (exact) return exact;
  const partial = INDUSTRY_CATEGORIES.filter((c) => normalize(c).includes(kw));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new Error(`行业「${keyword}」匹配到多个门类：${partial.join('、')}，请用完整名称重试`);
  }
  throw new Error(
    `未找到行业「${keyword}」。巨潮仅支持证监会行业门类：${INDUSTRY_CATEGORIES.join('、')}`,
  );
}
