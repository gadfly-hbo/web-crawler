/** 证券清单目录：拉取巨潮全量清单，内存缓存 + stale-while-error，提供名称/代码/拼音搜索。 */

export interface StockEntry {
  code: string;
  name: string;
  pinyin: string;
  orgId: string;
  category: string;
}

const DEFAULT_ORIGIN = 'https://www.cninfo.com.cn';
const DEFAULT_TTL = 24 * 3600_000;

export class StockDirectory {
  private readonly origin: string;
  private readonly ttlMs: number;
  private readonly fetchImpl: typeof fetch;
  private cache: { at: number; list: StockEntry[] } | null = null;

  constructor(opts: { origin?: string; ttlMs?: number; fetchImpl?: typeof fetch } = {}) {
    this.origin = opts.origin ?? process.env.CNINFO_ORIGIN ?? DEFAULT_ORIGIN;
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async fetchList(): Promise<StockEntry[]> {
    const res = await this.fetchImpl(`${this.origin}/new/data/szse_stock.json`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { stockList?: Array<Record<string, unknown>> };
    return (data.stockList ?? []).map((s) => ({
      code: String(s.code ?? ''),
      name: String(s.zwjc ?? ''),
      pinyin: String(s.pinyin ?? ''),
      orgId: String(s.orgId ?? ''),
      category: String(s.category ?? ''),
    }));
  }

  /** 加载清单：TTL 内用缓存；刷新失败回退旧缓存；无缓存则抛错。 */
  private async load(): Promise<StockEntry[]> {
    if (this.cache && Date.now() - this.cache.at < this.ttlMs) return this.cache.list;
    try {
      const list = await this.fetchList();
      this.cache = { at: Date.now(), list };
      return list;
    } catch (err) {
      if (this.cache) return this.cache.list;
      throw err;
    }
  }

  async search(keyword: string, limit = 20): Promise<StockEntry[]> {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return [];
    const list = await this.load();
    const exact = (s: StockEntry) =>
      s.code === keyword.trim() || s.name === keyword.trim() || s.pinyin.toLowerCase() === kw;
    const fuzzy = (s: StockEntry) =>
      s.code.startsWith(kw) || s.name.includes(keyword.trim()) || s.pinyin.toLowerCase().startsWith(kw);
    const rank = (s: StockEntry) => (s.category === 'A股' ? 0 : 1);
    return list
      .filter((s) => exact(s) || fuzzy(s))
      .sort((a, b) => (exact(a) ? 0 : 1) - (exact(b) ? 0 : 1) || rank(a) - rank(b) || a.code.localeCompare(b.code))
      .slice(0, limit);
  }
}
