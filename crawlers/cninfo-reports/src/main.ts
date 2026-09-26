/**
 * cninfo-reports：A 股上市公司财报下载器。
 *
 * 数据来源：巨潮资讯网（证监会指定信息披露网站）公开接口
 *   - szse_stock.json：全量证券清单（公告查询所需的 orgId）
 *   - hisAnnouncement/query：公告检索（按公司 / 行业门类 / 发布日期 / 报告类型）
 *   - static.cninfo.com.cn：公告 PDF 下载
 */
import { appendFile, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parseArgs, type ReportType } from './cli.js';
import {
  downloadAnnouncement,
  fetchStockList,
  queryAnnouncements,
  type Announcement,
  type StockInfo,
} from './cninfo.js';
import { setRateLimit } from './http.js';
import { matchIndustry } from './industries.js';

const REPORT_TYPES: Record<ReportType, { category: string; keywords: string[]; label: string }> = {
  annual: { category: 'category_ndbg_szsh', keywords: ['年度报告'], label: '年报' },
  semi: { category: 'category_bndbg_szsh', keywords: ['半年度报告'], label: '中报' },
  q1: { category: 'category_yjdbg_szsh', keywords: ['第一季度报告', '一季度报告'], label: '一季报' },
  q3: { category: 'category_sjdbg_szsh', keywords: ['第三季度报告', '三季度报告'], label: '三季报' },
};

// 排除摘要、英文版、更正/补充类公告；「关于…」开头的是相关公告而非报告本身
const TITLE_EXCLUDES = ['摘要', '英文', '已取消', '取消', '补充', '更正', '说明', '提示', '关于'];

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

interface Summary {
  companies: number;
  matched: number;
  downloaded: number;
  skipped: number;
  bytes: number;
  failed: number;
}

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

function log(msg: string): void {
  console.log(msg);
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

function fmtBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;
}

function classifyReport(title: string, selected: ReportType[]): ReportType | null {
  const t = title.replace(/\s+/g, '');
  if (TITLE_EXCLUDES.some((p) => t.includes(p))) return null;
  // 「半年度报告」包含子串「年度报告」，必须先判 semi
  const order: ReportType[] = ['semi', 'annual', 'q1', 'q3'];
  for (const type of order) {
    if (!selected.includes(type)) continue;
    if (REPORT_TYPES[type].keywords.some((kw) => t.includes(kw))) return type;
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
  }
  return all;
}

async function main(): Promise<void> {
  // pnpm 12 会把参数分隔符 `--` 也透传给脚本，直接过滤掉
  const opts = parseArgs(process.argv.slice(2).filter((a) => a !== '--'));
  setRateLimit(opts.sleepMs);

  const targets: QueryTarget[] = [];
  if (opts.companies.length > 0) {
    log('获取全量证券清单…');
    const stocks = await fetchStockList();
    for (const keyword of opts.companies) {
      const s = resolveStock(keyword, stocks);
      targets.push({ label: `${s.code} ${s.name}`, stock: `${s.code},${s.orgId}` });
      log(`公司：${s.code} ${s.name}`);
    }
  }
  for (const keyword of opts.industries) {
    const industry = matchIndustry(keyword);
    targets.push({ label: industry, trade: industry });
    log(`行业：${industry}（证监会行业门类）`);
  }

  const seDate = opts.year ? `${opts.year}-01-01~${opts.year + 1}-12-31` : `${opts.from}~${opts.to}`;
  const categories = opts.types.map((t) => REPORT_TYPES[t].category);
  const outDir = opts.outDir ?? path.join(repoRoot, 'data', 'cninfo-reports');
  const reportsDir = path.join(outDir, 'reports');
  const indexPath = path.join(outDir, 'index.jsonl');

  log('');
  log(
    `检索目标 ${targets.length} 个；报告类型：${opts.types.map((t) => REPORT_TYPES[t].label).join('/')}；公告发布窗口：${seDate}`,
  );
  log(`输出目录：${outDir}`);
  if (opts.dryRun) log('【dry-run】仅列出待下载文件，不写入任何数据');
  log('');

  // 查询阶段：逐目标检索，按公司分组去重
  const byCompany = new Map<string, CompanyMatch>();
  const seenAnnIds = new Set<string>();
  const summary: Summary = {
    companies: 0,
    matched: 0,
    downloaded: 0,
    skipped: 0,
    bytes: 0,
    failed: 0,
  };
  for (const target of targets) {
    log(`检索：${target.label}`);
    try {
      const anns = await collectAnnouncements(target, categories, seDate);
      let matched = 0;
      for (const ann of anns) {
        if (seenAnnIds.has(ann.announcementId)) continue;
        seenAnnIds.add(ann.announcementId);
        const type = classifyReport(ann.title, opts.types);
        if (!type) continue;
        // --year 模式按报告期年份过滤标题（巨潮 seDate 只过滤公告发布日）
        if (opts.year && !ann.title.replace(/\s+/g, '').includes(`${opts.year}年`)) continue;
        const group = byCompany.get(ann.secCode) ?? { code: ann.secCode, name: ann.secName, items: [] };
        group.items.push({ ann, type });
        byCompany.set(ann.secCode, group);
        matched++;
      }
      log(`  候选公告 ${anns.length} 条，匹配 ${matched} 条`);
    } catch (err) {
      summary.failed++;
      log(`  [error] 检索失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let companies = [...byCompany.values()].sort((a, b) => a.code.localeCompare(b.code));
  log(`涉及公司 ${companies.length} 家`);
  if (opts.limit && companies.length > opts.limit) {
    log(`--limit ${opts.limit}：仅处理前 ${opts.limit} 家（按代码排序）`);
    companies = companies.slice(0, opts.limit);
  }
  summary.companies = companies.length;
  log('');

  // 下载阶段：按公司遍历
  if (!opts.dryRun) await mkdir(outDir, { recursive: true });
  for (const [idx, company] of companies.entries()) {
    log(`=== [${idx + 1}/${companies.length}] ${company.code} ${company.name} ===`);
    summary.matched += company.items.length;
    try {
      for (const { ann, type } of company.items) {
        const file = path.join(
          reportsDir,
          `${company.code}_${sanitizeFilename(company.name)}`,
          `${beijingDate(ann.announcementTime)}_${sanitizeFilename(ann.title)}.pdf`,
        );
        if (opts.dryRun) {
          log(`  [dry-run] [${REPORT_TYPES[type].label}] ${path.relative(reportsDir, file)}`);
          continue;
        }
        await mkdir(path.dirname(file), { recursive: true });
        let status: string;
        if (await fileExists(file)) {
          status = 'skipped-existing';
          summary.skipped++;
          log(`  = 已存在 ${path.relative(reportsDir, file)}`);
        } else {
          const buf = await downloadAnnouncement(ann);
          await writeFile(file, buf);
          status = 'downloaded';
          summary.downloaded++;
          summary.bytes += buf.length;
          log(
            `  ↓ [${REPORT_TYPES[type].label}] ${path.relative(reportsDir, file)}（${fmtBytes(buf.length)}）`,
          );
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
            url: `https://static.cninfo.com.cn/${ann.adjunctUrl}`,
            file: path.relative(path.dirname(indexPath), file),
          }) + '\n',
          'utf8',
        );
      }
    } catch (err) {
      summary.failed++;
      log(`  [error] 下载失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  log('');
  log(
    `完成：${summary.companies} 家公司，匹配 ${summary.matched} 份报告，新下载 ${summary.downloaded} 份（${fmtBytes(summary.bytes)}），已存在跳过 ${summary.skipped} 份，失败 ${summary.failed} 处`,
  );
  if (!opts.dryRun) log(`PDF 目录：${reportsDir}\n索引文件：${indexPath}`);
  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`[fatal] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
