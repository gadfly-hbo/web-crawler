/**
 * 爬虫核心流程引擎：纯粹通过 Reporter 发射 CrawlEvent，消除全局可变状态与输出耦合。
 */
import { appendFile, mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CliOptions } from './cli.js';
import {
  announcementDownloadUrl,
  downloadAnnouncement,
  fetchStockList,
  queryAnnouncements,
  type Announcement,
  type StockInfo,
} from './cninfo.js';
import { matchIndustry } from './domain/industries.js';
import type { ReportType } from './domain/types.js';
import type { CrawlSummary } from './events.js';
import { setRateLimit } from './http.js';
import type { Reporter } from './reporter.js';

const REPORT_KEYWORDS: Record<ReportType, string[]> = {
  annual: ['年度报告'],
  semi: ['半年度报告'],
  q1: ['第一季度报告', '一季度报告'],
  q3: ['第三季度报告', '三季度报告'],
};

// 排除摘要、英文版、更正/补充类公告；「关于…」开头的是相关公告而非报告本身
const TITLE_EXCLUDES = ['摘要', '英文', '已取消', '取消', '补充', '更正', '说明', '提示', '关于'];

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

interface QueryTarget {
  label: string;
  stock?: string; // "code,orgId"
  trade?: string; // 行业门类名
}

interface CompanyMatch {
  code: string;
  name: string;
  items: Array<{ ann: Announcement; type: ReportType }>;
}

/** 巨潮公告时间为北京时间，转日期字符串时显式加 8 小时偏移。 */
function beijingDate(ms: number): string {
  return new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|\r\n]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function classifyReport(title: string, selected: ReportType[]): ReportType | null {
  const t = title.replace(/\s+/g, '');
  if (TITLE_EXCLUDES.some((p) => t.includes(p))) return null;
  // 「半年度报告」包含子串「年度报告」，必须先判 semi
  const order: ReportType[] = ['semi', 'annual', 'q1', 'q3'];
  for (const type of order) {
    if (!selected.includes(type)) continue;
    if (REPORT_KEYWORDS[type].some((kw) => t.includes(kw))) return type;
  }
  return null;
}

/** 在全量清单中解析用户输入：代码/简称/拼音精确匹配优先，模糊匹配唯一时可用。 */
function resolveStock(keyword: string, stocks: StockInfo[]): StockInfo {
  const kw = keyword.toLowerCase();
  const exact = stocks.filter(
    (s) => s.code === keyword || s.name === keyword || s.pinyin.toLowerCase() === kw,
  );
  const pick = exact.find((s) => s.category === 'A股') ?? exact[0];
  if (pick) return pick;
  const fuzzy = stocks.filter((s) => s.name.includes(keyword) || s.pinyin.toLowerCase().startsWith(kw));
  if (fuzzy.length === 1) return fuzzy[0];
  if (fuzzy.length > 1) {
    throw new Error(
      `「${keyword}」匹配到多家公司：${fuzzy.slice(0, 8).map((s) => `${s.code} ${s.name}`).join('、')}${fuzzy.length > 8 ? ' …' : ''}，请改用 6 位代码或完整简称`,
    );
  }
  throw new Error(`未找到公司「${keyword}」，请检查名称或使用 6 位证券代码`);
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/** 拉取一个检索目标在查询窗口内的全部候选公告（自动翻页）。 */
async function collectAnnouncements(
  target: QueryTarget,
  categories: string[],
  seDate: string,
): Promise<Announcement[]> {
  const all: Announcement[] = [];
  for (let pageNum = 1; pageNum <= 100; pageNum++) {
    const page = await queryAnnouncements({
      stock: target.stock,
      trade: target.trade,
      categories,
      seDate,
      pageNum,
    });
    all.push(...page.list);
    if (page.list.length === 0 || !page.hasMore) break;
    if (pageNum === 100 && page.hasMore) {
      throw new Error(
        `查询结果超过巨潮翻页上限（100 页 / 3000 条），存在未拉取的公告，请收窄查询范围（如按单一公司或缩短日期窗口）`,
      );
    }
  }
  return all;
}

const CATEGORY_MAP: Record<ReportType, string> = {
  annual: 'category_ndbg_szsh',
  semi: 'category_bndbg_szsh',
  q1: 'category_yjdbg_szsh',
  q3: 'category_sjdbg_szsh',
};

export type EngineOptions = Omit<CliOptions, 'json' | 'help'>;

export async function run(opts: EngineOptions, reporter: Reporter): Promise<CrawlSummary> {
  setRateLimit(opts.sleepMs);

  const targets: QueryTarget[] = [];
  if (opts.companies.length > 0) {
    reporter({ type: 'resolvingStocks' });
    const stocks = await fetchStockList();
    for (const keyword of opts.companies) {
      const s = resolveStock(keyword, stocks);
      targets.push({ label: `${s.code} ${s.name}`, stock: `${s.code},${s.orgId}` });
      reporter({ type: 'resolvedCompany', code: s.code, name: s.name });
    }
  }
  for (const keyword of opts.industries) {
    const industry = matchIndustry(keyword);
    targets.push({ label: industry, trade: industry });
    reporter({ type: 'resolvedIndustry', industry });
  }

  let seDate: string;
  if (opts.year) {
    const onlyAnnual = opts.types.length > 0 && opts.types.every((t) => t === 'annual');
    const noAnnual = opts.types.length > 0 && opts.types.every((t) => t !== 'annual');
    if (onlyAnnual) {
      seDate = `${opts.year + 1}-01-01~${opts.year + 1}-12-31`;
    } else if (noAnnual) {
      seDate = `${opts.year}-01-01~${opts.year}-12-31`;
    } else {
      seDate = `${opts.year}-01-01~${opts.year + 1}-12-31`;
    }
  } else {
    seDate = `${opts.from}~${opts.to}`;
  }

  const categories = opts.types.map((t) => CATEGORY_MAP[t]);
  const outDir = opts.outDir ?? path.join(repoRoot, 'data', 'cninfo-reports');
  const reportsDir = path.join(outDir, 'reports');
  const indexPath = path.join(outDir, 'index.jsonl');

  reporter({
    type: 'searchPlan',
    targetsCount: targets.length,
    types: opts.types,
    seDate,
    outDir,
    dryRun: opts.dryRun,
  });

  const byCompany = new Map<string, CompanyMatch>();
  const seenAnnIds = new Set<string>();
  const summary: CrawlSummary = {
    companies: 0,
    matched: 0,
    downloaded: 0,
    skipped: 0,
    bytes: 0,
    failed: 0,
    outDir,
  };

  for (const target of targets) {
    reporter({ type: 'queryStart', target: target.label });
    try {
      const anns = await collectAnnouncements(target, categories, seDate);
      let matched = 0;
      for (const ann of anns) {
        if (seenAnnIds.has(ann.announcementId)) continue;
        seenAnnIds.add(ann.announcementId);
        const type = classifyReport(ann.title, opts.types);
        if (!type) continue;
        if (opts.year && !ann.title.replace(/\s+/g, '').includes(`${opts.year}年`)) continue;
        const group = byCompany.get(ann.secCode) ?? { code: ann.secCode, name: ann.secName, items: [] };
        group.items.push({ ann, type });
        byCompany.set(ann.secCode, group);
        matched++;
      }
      reporter({ type: 'queryMatched', target: target.label, total: anns.length, matched });
    } catch (err) {
      summary.failed++;
      const reason = err instanceof Error ? err.message : String(err);
      reporter({ type: 'queryError', target: target.label, reason });
    }
  }

  let companies = [...byCompany.values()].sort((a, b) => a.code.localeCompare(b.code));
  reporter({ type: 'companiesTotal', count: companies.length, limit: opts.limit });
  if (opts.limit && companies.length > opts.limit) {
    companies = companies.slice(0, opts.limit);
  }
  summary.companies = companies.length;
  reporter({ type: 'start', totalCompanies: companies.length, dryRun: opts.dryRun });

  if (!opts.dryRun) await mkdir(outDir, { recursive: true });
  for (const [idx, company] of companies.entries()) {
    reporter({
      type: 'company',
      index: idx + 1,
      total: companies.length,
      code: company.code,
      name: company.name,
    });
    summary.matched += company.items.length;
    for (const { ann, type } of company.items) {
      const file = path.join(
        reportsDir,
        `${company.code}_${sanitizeFilename(company.name)}`,
        `${beijingDate(ann.announcementTime)}_${sanitizeFilename(ann.title)}.pdf`,
      );
      const rel = path.relative(reportsDir, file);
      const partFile = `${file}.part`;
      if (opts.dryRun) {
        reporter({ type: 'fileDryRun', reportType: type, path: rel });
        continue;
      }
      try {
        await mkdir(path.dirname(file), { recursive: true });
        let status: string;
        if (await fileExists(file)) {
          status = 'skipped-existing';
          summary.skipped++;
          reporter({
            type: 'file',
            status: 'skipped',
            code: company.code,
            name: company.name,
            reportType: type,
            title: ann.title,
            path: rel,
          });
        } else {
          await unlink(partFile).catch(() => {});
          const buf = await downloadAnnouncement(ann);
          await writeFile(partFile, buf);
          await rename(partFile, file);
          status = 'downloaded';
          summary.downloaded++;
          summary.bytes += buf.length;
          reporter({
            type: 'file',
            status: 'downloaded',
            code: company.code,
            name: company.name,
            reportType: type,
            title: ann.title,
            path: rel,
            bytes: buf.length,
          });
        }
        await appendFile(
          indexPath,
          JSON.stringify({
            time: new Date().toISOString(),
            status,
            secCode: company.code,
            secName: company.name,
            type,
            title: ann.title,
            publishedAt: new Date(ann.announcementTime).toISOString(),
            announcementId: ann.announcementId,
            url: announcementDownloadUrl(ann),
            file: path.relative(path.dirname(indexPath), file),
          }) + '\n',
          'utf8',
        );
      } catch (err) {
        await unlink(partFile).catch(() => {});
        summary.failed++;
        const reason = err instanceof Error ? err.message : String(err);
        reporter({
          type: 'file',
          status: 'failed',
          code: company.code,
          name: company.name,
          reportType: type,
          title: ann.title,
          path: rel,
          reason,
        });
      }
    }
  }

  if (opts.dryRun) {
    reporter({ type: 'preview', companies: summary.companies, reports: summary.matched });
  }
  reporter({ type: 'done', summary });
  return summary;
}
