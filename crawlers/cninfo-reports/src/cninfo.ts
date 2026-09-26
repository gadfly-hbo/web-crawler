/** 巨潮资讯网（法定信息披露平台）公开接口封装。 */
import { httpBuffer, httpJson } from './http.js';

const CNINFO_ORIGIN = 'https://www.cninfo.com.cn';
const STATIC_ORIGIN = 'https://static.cninfo.com.cn';
const QUERY_REFERER = `${CNINFO_ORIGIN}/new/commonUrl/pageOfSearch?url=disclosure/list/search`;

export interface StockInfo {
  code: string; // 6 位证券代码
  name: string; // 公司简称
  pinyin: string;
  orgId: string; // 巨潮内部组织 ID，公告查询必填
  category: string; // A股 / B股 / 债券…
}

export interface Announcement {
  announcementId: string;
  secCode: string;
  secName: string;
  title: string;
  announcementTime: number; // 公告发布时间（epoch 毫秒）
  adjunctUrl: string; // PDF 相对路径
}

/** 获取全量证券清单（含 orgId）。 */
export async function fetchStockList(): Promise<StockInfo[]> {
  const data = await httpJson<{ stockList?: Array<Record<string, unknown>> }>(
    `${CNINFO_ORIGIN}/new/data/szse_stock.json`,
  );
  return (data.stockList ?? []).map((s) => ({
    code: String(s.code ?? ''),
    name: String(s.zwjc ?? ''),
    pinyin: String(s.pinyin ?? ''),
    orgId: String(s.orgId ?? ''),
    category: String(s.category ?? ''),
  }));
}

/**
 * 按公告发布日期查询公告。
 * stock（"code,orgId"）与 trade（行业门类名）二选一或组合传空：
 *   - 按公司查：stock 必须是 "code,orgId"，仅传代码沪市公司会返回 0 结果（已实测）
 *   - 按行业查：trade 传证监会行业门类名（如 金融业），大类名实测无效
 * 注意：category 多值必须用分号分隔——实测逗号会导致巨潮忽略过滤条件返回全量公告。
 */
export async function queryAnnouncements(params: {
  stock?: string;
  trade?: string;
  categories: string[];
  seDate: string; // "YYYY-MM-DD~YYYY-MM-DD"
  pageNum: number;
}): Promise<{ list: Announcement[]; total: number; hasMore: boolean }> {
  const body = new URLSearchParams({
    pageNum: String(params.pageNum),
    pageSize: '30',
    column: 'szse',
    tabName: 'fulltext',
    plate: '',
    stock: params.stock ?? '',
    searchkey: '',
    secid: '',
    category: params.categories.join(';'),
    trade: params.trade ?? '',
    seDate: params.seDate,
    sortName: '',
    sortType: '',
    isHLtitle: 'false',
  });
  const data = await httpJson<Record<string, any>>(`${CNINFO_ORIGIN}/new/hisAnnouncement/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: QUERY_REFERER,
    },
    body: body.toString(),
  });
  const raw = Array.isArray(data.announcements) ? (data.announcements as Array<Record<string, any>>) : [];
  return {
    list: raw.map((a) => ({
      announcementId: String(a.announcementId ?? ''),
      secCode: String(a.secCode ?? ''),
      secName: String(a.secName ?? ''),
      title: String(a.announcementTitle ?? '').replace(/<[^>]+>/g, ''),
      announcementTime: Number(a.announcementTime ?? 0),
      adjunctUrl: String(a.adjunctUrl ?? ''),
    })),
    total: Number(data.totalAnnouncement ?? raw.length),
    hasMore: Boolean(data.hasMore),
  };
}

export function announcementDownloadUrl(announcement: Announcement): string {
  return `${STATIC_ORIGIN}/${announcement.adjunctUrl}`;
}

export async function downloadAnnouncement(announcement: Announcement): Promise<Uint8Array> {
  return httpBuffer(announcementDownloadUrl(announcement));
}
