/**
 * cninfo-reports：A 股上市公司财报下载器 CLI 入口。
 *
 * 数据来源：巨潮资讯网（证监会指定信息披露网站）公开接口
 */
import process from 'node:process';

import { parseArgs, USAGE, type CliOptions } from './cli.js';
import { run } from './engine.js';
import { ndjsonReporter, textReporter } from './reporter.js';

export { run } from './engine.js';
export { ndjsonReporter, textReporter, type Reporter } from './reporter.js';

async function main(): Promise<void> {
  // pnpm 12 会把参数分隔符 `--` 也透传给脚本，直接过滤掉
  const argv = process.argv.slice(2).filter((a) => a !== '--');
  // 先扫 --json：参数校验失败也要按机器可读格式回报
  const jsonMode = argv.includes('--json');
  let opts: CliOptions;
  try {
    opts = parseArgs(argv);
    if (opts.help) {
      console.log(USAGE);
      return;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (jsonMode) {
      process.stdout.write(JSON.stringify({ type: 'error', message }) + '\n');
    } else {
      console.error(`[fatal] ${message}`);
    }
    process.exitCode = 1;
    return;
  }

  const reporter = opts.json ? ndjsonReporter() : textReporter();
  try {
    const summary = await run(opts, reporter);
    if (summary.failed > 0) process.exitCode = 1;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      process.stdout.write(JSON.stringify({ type: 'error', message }) + '\n');
    } else {
      console.error(`[fatal] ${message}`);
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[fatal] ${message}`);
  process.exitCode = 1;
});
