/** 命令行参数解析（无第三方依赖）。 */
import process from 'node:process';

export type ReportType = 'annual' | 'semi' | 'q1' | 'q3';

export interface CliOptions {
  companies: string[];
  industries: string[];
  year?: number;
  from?: string;
  to?: string;
  types: ReportType[];
  limit?: number;
  sleepMs: number;
  dryRun: boolean;
  outDir?: string;
  json: boolean;
}

export const USAGE = `用法：pnpm --filter cninfo-reports start -- [选项]

选项：
  -c, --company <名称|代码|拼音>   目标公司，可逗号分隔或重复使用
  -i, --industry <行业门类>        目标行业（证监会行业门类，如 金融业、制造业），可逗号分隔
      --year <YYYY>               报告期年份，如 2024 表示抓 2024 年的年报/季报
      --from <YYYY-MM-DD>         按公告发布日期范围抓取（与 --year 互斥，需与 --to 成对）
      --to <YYYY-MM-DD>
  -t, --type <annual|semi|q1|q3|all>  报告类型，默认 all，可逗号分隔
      --limit <N>                 最多处理 N 家公司，按代码排序取前 N（调试/试跑用）
      --sleep <ms>                相邻请求最小间隔，默认 1000，最低 200
      --dry-run                   只列出将下载的文件，不下载、不写任何文件
      --json                      输出 NDJSON 结构化事件（供工作台等程序消费），替代人类可读文本
  -o, --out <dir>                 输出根目录，默认 <仓库根>/data/cninfo-reports
  -h, --help                      显示本帮助

示例：
  # 平安银行 2024 年年度报告
  pnpm --filter cninfo-reports start -- -c 平安银行 --year 2024 -t annual
  # 金融业全部公司 2024 年年报（先 dry-run 预览再全量）
  pnpm --filter cninfo-reports start -- -i 金融业 --year 2024 -t annual --dry-run
  pnpm --filter cninfo-reports start -- -i 金融业 --year 2024 -t annual
  # 指定公告发布日期窗口内的中报（不按报告期年份过滤标题）
  pnpm --filter cninfo-reports start -- -c 000001 --from 2025-07-01 --to 2025-09-30 -t semi`;

const VALID_TYPES = new Set(['annual', 'semi', 'q1', 'q3', 'all']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    companies: [],
    industries: [],
    types: [],
    sleepMs: 1000,
    dryRun: false,
    json: false,
  };
  // 解析阶段先收集原始字符串，校验通过后再展开为类型安全的 ReportType
  const rawTypes: string[] = [];

  let i = 0;
  const take = (flag: string): string => {
    i++;
    if (i >= argv.length) throw new Error(`参数 ${flag} 缺少取值\n\n${USAGE}`);
    return argv[i];
  };

  while (i < argv.length) {
    const arg = argv[i];
    switch (arg) {
      case '-c':
      case '--company': {
        const v = take(arg);
        opts.companies.push(...v.split(',').map((s) => s.trim()).filter(Boolean));
        break;
      }
      case '-i':
      case '--industry': {
        const v = take(arg);
        opts.industries.push(...v.split(',').map((s) => s.trim()).filter(Boolean));
        break;
      }
      case '--year':
        opts.year = Number(take(arg));
        break;
      case '--from':
        opts.from = take(arg);
        break;
      case '--to':
        opts.to = take(arg);
        break;
      case '-t':
      case '--type': {
        const v = take(arg);
        rawTypes.push(...v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
        break;
      }
      case '--limit':
        opts.limit = Number(take(arg));
        break;
      case '--sleep':
        opts.sleepMs = Number(take(arg));
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--json':
        opts.json = true;
        break;
      case '-o':
      case '--out':
        opts.outDir = take(arg);
        break;
      case '-h':
      case '--help':
        console.log(USAGE);
        process.exit(0);
        break;
      default:
        throw new Error(`未知参数：${arg}\n\n${USAGE}`);
    }
    i++;
  }

  validate(opts, rawTypes);
  return opts;
}

function validate(opts: CliOptions, rawTypes: string[]): void {
  if (opts.companies.length === 0 && opts.industries.length === 0) {
    throw new Error(`必须至少指定 --company 或 --industry 之一\n\n${USAGE}`);
  }
  const invalid = rawTypes.filter((t) => !VALID_TYPES.has(t));
  if (invalid.length > 0) {
    throw new Error(`无效的报告类型：${invalid.join('、')}（可选 annual/semi/q1/q3/all）`);
  }
  const expanded = new Set<ReportType>();
  for (const t of rawTypes.length > 0 ? rawTypes : ['all']) {
    if (t === 'all') {
      expanded.add('annual');
      expanded.add('semi');
      expanded.add('q1');
      expanded.add('q3');
    } else {
      expanded.add(t as ReportType);
    }
  }
  opts.types = [...expanded];

  const hasRange = Boolean(opts.from || opts.to);
  if (opts.year != null && hasRange) throw new Error('--year 与 --from/--to 互斥');
  if (opts.year != null && (!Number.isInteger(opts.year) || opts.year < 1990 || opts.year > 2100)) {
    throw new Error('--year 应为 1990~2100 之间的年份');
  }
  if (opts.year == null && !hasRange) {
    throw new Error(`必须指定时间：--year 或 --from/--to\n\n${USAGE}`);
  }
  if (Boolean(opts.from) !== Boolean(opts.to)) throw new Error('--from 与 --to 需成对使用');
  if (opts.from && !DATE_RE.test(opts.from)) throw new Error('--from 格式应为 YYYY-MM-DD');
  if (opts.to && !DATE_RE.test(opts.to)) throw new Error('--to 格式应为 YYYY-MM-DD');
  if (opts.from && opts.to && opts.from > opts.to) throw new Error('--from 不能晚于 --to');
  if (!Number.isFinite(opts.sleepMs) || opts.sleepMs < 200) {
    throw new Error('--sleep 不能低于 200（对目标站点保持礼貌）');
  }
  if (opts.limit != null && (!Number.isInteger(opts.limit) || opts.limit < 1)) {
    throw new Error('--limit 应为正整数');
  }
}
