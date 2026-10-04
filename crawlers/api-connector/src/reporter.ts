/** Reporter 实现：分离 NDJSON 输出与人类可读控制台输出。 */
import process from 'node:process';

import type { CrawlEvent, Reporter } from './events.js';

export type { Reporter } from './events.js';

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
 * NDJSON Reporter：面向机器消费，每行一个 JSON 对象，供工作台子进程消费。
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
 * Text Reporter：面向命令行终端用户，提供友好的控制台输出。
 */
export function textReporter(
  write: (line: string) => void = (line) => console.log(line),
  writeErr: (line: string) => void = (line) => console.error(line),
): Reporter {
  let isDryRun = false;

  return (event: CrawlEvent) => {
    switch (event.type) {
      case 'start':
        isDryRun = event.dryRun;
        if (isDryRun) {
          write('【dry-run】只统计分页与清单，不下载文件、不写入磁盘');
        }
        break;
      case 'company':
        write(`=== [${event.index}/${event.total}] ${event.name} ===`);
        break;
      case 'queryError':
        write(`  [error] 请求失败 [${event.target}]：${event.reason}`);
        break;
      case 'file':
        if (event.status === 'skipped') {
          write(`  = 已存在 ${event.path ?? ''} (${event.title ?? ''})`);
        } else if (event.status === 'downloaded') {
          write(`  ↓ 下载完成 ${event.path ?? ''}（${fmtBytes(event.bytes ?? 0)}）- ${event.title ?? ''}`);
        } else if (event.status === 'failed') {
          write(`  [error] 下载失败：${event.reason ?? '未知错误'} - ${event.title ?? ''}`);
        }
        break;
      case 'preview':
        write(`【dry-run 预览】匹配 ${event.reports} 条数据记录`);
        break;
      case 'done':
        write('');
        write(
          `完成：共匹配 ${event.summary.matched} 条记录，下载 ${event.summary.downloaded} 份（${fmtBytes(event.summary.bytes)}），跳过 ${event.summary.skipped} 份，失败 ${event.summary.failed} 处`,
        );
        if (!isDryRun) {
          write(`输出目录：${event.summary.outDir}`);
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
