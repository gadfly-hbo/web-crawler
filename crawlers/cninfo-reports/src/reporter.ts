/** Reporter 实现：分离 NDJSON 输出与人类可读控制台输出。 */
import process from 'node:process';
import path from 'node:path';

import { REPORT_TYPE_LABELS } from './domain/types.js';
import type { CrawlEvent } from './events.js';

export type Reporter = (event: CrawlEvent) => void;

function fmtBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;
}

const NDJSON_EVENT_TYPES = new Set([
  'start',
  'queryError',
  'company',
  'file',
  'preview',
  'done',
  'error',
]);

/**
 * NDJSON Reporter：面向机器消费，每行一个 JSON 对象，抑制一切人类可读文本。
 */
export function ndjsonReporter(
  write: (line: string) => void = (line) => process.stdout.write(line),
): Reporter {
  return (event: CrawlEvent) => {
    if (NDJSON_EVENT_TYPES.has(event.type)) {
      write(JSON.stringify(event) + '\n');
    }
  };
}

/**
 * Text Reporter：面向命令行终端用户，逐字节对齐原有 CLI 文本输出格式。
 */
export function textReporter(
  write: (line: string) => void = (line) => console.log(line),
  writeErr: (line: string) => void = (line) => console.error(line),
): Reporter {
  let isDryRun = false;
  let reportsDir = '';
  let indexPath = '';

  return (event: CrawlEvent) => {
    switch (event.type) {
      case 'resolvingStocks':
        write('获取全量证券清单…');
        break;
      case 'resolvedCompany':
        write(`公司：${event.code} ${event.name}`);
        break;
      case 'resolvedIndustry':
        write(`行业：${event.industry}（证监会行业门类）`);
        break;
      case 'searchPlan':
        isDryRun = event.dryRun;
        reportsDir = path.join(event.outDir, 'reports');
        indexPath = path.join(event.outDir, 'index.jsonl');
        write('');
        write(
          `检索目标 ${event.targetsCount} 个；报告类型：${event.types.map((t) => REPORT_TYPE_LABELS[t]).join('/')}；公告发布窗口：${event.seDate}`,
        );
        write(`输出目录：${event.outDir}`);
        if (event.dryRun) write('【dry-run】仅列出待下载文件，不写入任何数据');
        write('');
        break;
      case 'queryStart':
        write(`检索：${event.target}`);
        break;
      case 'queryMatched':
        write(`  候选公告 ${event.total} 条，匹配 ${event.matched} 条`);
        break;
      case 'queryError':
        write(`  [error] 检索失败：${event.reason}`);
        break;
      case 'companiesTotal':
        write(`涉及公司 ${event.count} 家`);
        if (event.limit && event.count > event.limit) {
          write(`--limit ${event.limit}：仅处理前 ${event.limit} 家（按代码排序）`);
        }
        write('');
        break;
      case 'company':
        write(`=== [${event.index}/${event.total}] ${event.code} ${event.name} ===`);
        break;
      case 'fileDryRun':
        write(`  [dry-run] [${REPORT_TYPE_LABELS[event.reportType]}] ${event.path}`);
        break;
      case 'file':
        if (event.status === 'skipped') {
          write(`  = 已存在 ${event.path}`);
        } else if (event.status === 'downloaded') {
          const typeLabel = event.reportType ? REPORT_TYPE_LABELS[event.reportType] : '';
          write(`  ↓ [${typeLabel}] ${event.path}（${fmtBytes(event.bytes ?? 0)}）`);
        } else if (event.status === 'failed') {
          write(`  [error] 下载失败：${event.reason}`);
        }
        break;
      case 'done':
        write('');
        write(
          `完成：${event.summary.companies} 家公司，匹配 ${event.summary.matched} 份报告，新下载 ${event.summary.downloaded} 份（${fmtBytes(event.summary.bytes)}），已存在跳过 ${event.summary.skipped} 份，失败 ${event.summary.failed} 处`,
        );
        if (!isDryRun) {
          write(`PDF 目录：${reportsDir}\n索引文件：${indexPath}`);
        }
        break;
      case 'error':
        writeErr(`[fatal] ${event.message}`);
        break;
      default:
        break;
    }
  };
}
