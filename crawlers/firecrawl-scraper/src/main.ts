import fs from 'node:fs';
import path from 'node:path';
import { FirecrawlAdapter } from './adapter.js';
import { ScraperEngine } from './engine.js';
import type { ScrapeEvent } from './events.js';
import { MockAcquisitionAdapter } from './mock-adapter.js';

function printHelp(): void {
  console.log(`
firecrawl-scraper: 通用网页采集与原始快照引擎

用法:
  pnpm --filter firecrawl-scraper start -- [options]

选项:
  --url <url>           单个目标 URL
  --urls <u1,u2...>     多个目标 URL (逗号分隔)
  --urls-file <path>    从本地文件读取 URL 列表 (每行一个)
  -o, --out-dir <path>  快照输出目录 (默认: data/firecrawl-scraper/<timestamp>)
  --analyze             采集完成后自动执行商品规则提取与标价中位数对比分析
  --baseline <brand>    对比分析基准品牌 (默认: Brand A)
  --inspect-package <p> 检验标准化交付包 (验证 manifest 与全文件 SHA-256 签名)
  --mock                启用离线 Mock 适配器 (不产生真实网络请求)
  --api-key <key>       Firecrawl API 密钥 (默认读取 FIRECRAWL_API_KEY)
  --base-url <url>      Firecrawl 服务端点 (默认: https://api.firecrawl.dev)
  --json                输出 NDJSON 机器可读事件流 (工作台模式)
  -h, --help            查看帮助信息
`);
}

interface CliArgs {
  urls: string[];
  outDir: string;
  mock: boolean;
  json: boolean;
  analyze: boolean;
  baseline: string;
  apiKey?: string;
  baseUrl?: string;
  inspectPackage?: string;
}

function parseArgs(args: string[]): CliArgs {
  let urls: string[] = [];
  let outDir = '';
  let mock = false;
  let json = false;
  let analyze = false;
  let baseline = 'Brand A';
  let apiKey: string | undefined;
  let baseUrl: string | undefined;
  let inspectPackage: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    } else if (arg === '--analyze') {
      analyze = true;
    } else if (arg === '--inspect-package' && args[i + 1]) {
      inspectPackage = path.resolve(args[++i]);
    } else if (arg === '--baseline' && args[i + 1]) {
      baseline = args[++i];
    } else if (arg === '--api-key' && args[i + 1]) {
      apiKey = args[++i];
    } else if (arg === '--base-url' && args[i + 1]) {
      baseUrl = args[++i];
    } else if (arg === '--url' && args[i + 1]) {
      urls.push(args[++i]);
    } else if (arg === '--urls' && args[i + 1]) {
      const split = args[++i].split(',').map((u) => u.trim()).filter(Boolean);
      urls.push(...split);
    } else if (arg === '--urls-file' && args[i + 1]) {
      const filePath = path.resolve(args[++i]);
      if (fs.existsSync(filePath)) {
        const lines = fs
          .readFileSync(filePath, 'utf8')
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('#'));
        urls.push(...lines);
      } else {
        console.error(`错误: 文件未找到: ${filePath}`);
        process.exit(1);
      }
    } else if ((arg === '-o' || arg === '--out-dir') && args[i + 1]) {
      outDir = args[++i];
    } else if (arg === '--mock') {
      mock = true;
    } else if (arg === '--json') {
      json = true;
    }
  }

  if (inspectPackage) {
    return { urls: [], outDir: '', mock, json, analyze, baseline, apiKey, baseUrl, inspectPackage };
  }

  if (urls.length === 0) {
    // 若未提供，在 mock 模式下默认使用示例 URL
    if (mock) {
      urls = ['https://example.com/product/1', 'https://example.com/product/2'];
    } else {
      console.error('错误: 请通过 --url、--urls 或 --urls-file 指定至少一个目标 URL');
      printHelp();
      process.exit(1);
    }
  }

  if (!outDir) {
    const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    outDir = path.resolve(process.cwd(), 'data', 'firecrawl-scraper', `run_${ts}`);
  } else {
    outDir = path.resolve(process.cwd(), outDir);
  }

  return { urls, outDir, mock, json, analyze, baseline, apiKey, baseUrl, inspectPackage };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // 1. 若指定了 --inspect-package，执行交付包合规与哈希核验
  if (args.inspectPackage) {
    const { verifyDeliveryPackage } = await import('./manifest.js');
    const result = await verifyDeliveryPackage(args.inspectPackage);
    if (!result.valid || !result.manifest) {
      console.error('❌ 交付包核验失败:');
      for (const m of result.mismatches) {
        console.error(`  - ${m}`);
      }
      if (result.error) console.error(`  - 错误原因: ${result.error}`);
      process.exit(1);
    }

    const m = result.manifest;
    console.log('============================================================');
    console.log('📦 标准化交付包核验通过 (VERIFIED OK)');
    console.log('------------------------------------------------------------');
    console.log(`数据集 ID:      ${m.datasetId}`);
    console.log(`数据集版本:    ${m.datasetVersion}`);
    console.log(`生成时间:      ${m.generatedAt}`);
    console.log(`生成引擎:      ${m.generator.name} (${m.generator.version})`);
    console.log(`总样本量:      ${m.qualityMetrics.totalRecords} (合格: ${m.qualityMetrics.validRecords}, 缺失标价: ${m.qualityMetrics.missingPriceRecords})`);
    console.log(`数据完整率:    ${(m.qualityMetrics.dataCompletenessRate * 100).toFixed(1)}%`);
    console.log(`证据覆盖率:    ${(m.qualityMetrics.evidenceCoverageRate * 100).toFixed(1)}%`);
    console.log('------------------------------------------------------------');
    console.log(`SHA-256 签名校验 (${Object.keys(m.checksums).length}/${Object.keys(m.checksums).length} 文件匹配):`);
    for (const [file, hash] of Object.entries(m.checksums)) {
      console.log(`  ✔ ${file.padEnd(24)} -> SHA: ${hash.slice(0, 12)}...`);
    }
    console.log('============================================================');
    process.exit(0);
  }

  const reporter = (event: ScrapeEvent): void => {
    if (args.json) {
      process.stdout.write(`${JSON.stringify(event)}\n`);
    } else {
      switch (event.type) {
        case 'start':
          console.log(`[START] 开始采集 ${event.totalUrls} 个页面 (模式: ${event.provider})`);
          break;
        case 'scraping':
          console.log(`[FETCH] [${event.index}/${event.total}] ${event.url}`);
          break;
        case 'snapshot_saved':
          console.log(`[SAVED] [${event.index}] 快照: ${event.snapshotId} (SHA: ${event.contentHash.slice(0, 10)})`);
          break;
        case 'scrape_failed':
          console.warn(`[WARN]  [${event.index}] 采集失败: ${event.url} - ${event.reason}`);
          break;
        case 'done':
          console.log(`[DONE]  完成! 成功: ${event.summary.succeeded}, 失败: ${event.summary.failed}, 耗时: ${event.summary.durationMs}ms`);
          console.log(`        快照目录: ${event.summary.outDir}`);
          break;
        case 'error':
          console.error(`[ERROR] ${event.message}`);
          break;
      }
    }
  };

  const adapter = args.mock
    ? new MockAcquisitionAdapter()
    : new FirecrawlAdapter({ apiKey: args.apiKey, baseUrl: args.baseUrl });
  const engine = new ScraperEngine({
    outDir: args.outDir,
    adapter,
    reporter
  });

  try {
    const summary = await engine.run(args.urls);

    // 若启用了 --analyze，在采集完成后自动执行规则提取与标价中位数对比分析
    if (args.analyze && summary.succeeded > 0) {
      const snapshotsDir = path.join(args.outDir, 'snapshots');
      const taskId = path.basename(args.outDir);
      const { runProductAnalysisPipeline } = await import('./pipeline.js');
      const { report } = await runProductAnalysisPipeline(snapshotsDir, args.outDir, args.baseline, taskId);
      if (!args.json) {
        console.log(`\n[ANALYSIS] 分析完成! 样本总数: ${report.totalRecords}, 合格样本: ${report.validRecords}`);
        for (const b of report.brandSummaries) {
          const diffStr = b.relativeDiffToBaselinePercent !== undefined ? ` (相对基准: ${b.relativeDiffToBaselinePercent}%)` : '';
          console.log(`  - 品牌 [${b.brand}]: 标价中位数 ¥${b.medianPrice}, 均值 ¥${b.avgPrice}, 样本数 ${b.validSampleCount}${diffStr}`);
        }
      }
    }

    if (summary.failed > 0 && summary.succeeded === 0) {
      process.exit(1);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    reporter({ type: 'error', message });
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('main.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
