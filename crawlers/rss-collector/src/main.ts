/** RSS 采集 CLI 入口：--json NDJSON / 默认人类可读文本；退出码 failed>0 → 1（G9），校验失败 → 2（G11）。 */
import { runRssCollector, RssValidationError } from './collector.js';
import { parseArgs, usageText } from './cli.js';
import type { RssEvent } from './events.js';
import { validateRssParams } from './domain/index.js';

function textReporter(ev: RssEvent): void {
  switch (ev.type) {
    case 'start':
      console.log(`开始采集 ${ev.totalCompanies} 个 Feed...`);
      break;
    case 'company':
      console.log(`[${ev.index}/${ev.total}] 拉取 ${ev.name} ...`);
      break;
    case 'file':
      if (ev.status === 'downloaded') {
        console.log(`✔ ${ev.code} ${ev.name}（${ev.bytes ?? 0} 字节）`);
      } else {
        console.log(`✖ ${ev.code} 失败：${ev.reason ?? '未知原因'}`);
      }
      break;
    case 'queryError':
      console.log(`✖ ${ev.target} 失败：${ev.reason}`);
      break;
    case 'done':
      console.log(
        `完成：Feed 成功 ${ev.summary.downloaded} / 失败 ${ev.summary.failed}；条目 ${ev.summary.matched} 条；输出目录 ${ev.summary.outDir}`,
      );
      break;
    case 'error':
      console.error(`错误：${ev.message}`);
      break;
  }
}

async function main(): Promise<number> {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    console.error(usageText());
    return 2;
  }
  if (args.help) {
    console.log(usageText());
    return 0;
  }

  const reporter = args.json ? (ev: RssEvent) => console.log(JSON.stringify(ev)) : textReporter;

  // 校验期（域校验 + 出口门禁）：失败仅发 error 事件并以非零退出，不发 done（G11）
  const validationErrors = validateRssParams(
    {
      sourceType: 'rss',
      name: 'RSS Feed 采集',
      urls: args.urls,
      ...(args.limit !== undefined ? { limit: args.limit } : {}),
      ...(args.deadlineMs !== undefined ? { deadlineMs: args.deadlineMs } : {}),
    },
    { allowPrivateOrigin: process.env.RSS_ALLOW_PRIVATE_ORIGIN === '1' },
  );
  if (validationErrors.length > 0) {
    reporter({ type: 'error', message: validationErrors.join('；') });
    return 2;
  }

  try {
    const result = await runRssCollector({
      urls: args.urls,
      ...(args.limit !== undefined ? { limit: args.limit } : {}),
      ...(args.deadlineMs !== undefined ? { deadlineMs: args.deadlineMs } : {}),
      outDir: args.outDir,
      reporter,
    });
    return result.summary.failed > 0 ? 1 : 0;
  } catch (err) {
    if (err instanceof RssValidationError) {
      reporter({ type: 'error', message: err.errors.join('；') });
      return 2;
    }
    reporter({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    return 1;
  }
}

main().then(
  (code) => {
    process.exit(code);
  },
  (err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  },
);
