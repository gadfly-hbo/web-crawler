/**
 * cninfo-reports：A 股上市公司财报下载器 CLI 入口。
 *
 * 数据来源：巨潮资讯网（证监会指定信息披露网站）公开接口
 */
import process from 'node:process';

import { egressBlockReason } from 'data-governance/egress';

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

  // 出口门禁：数据源 origin 指向内网/回环时拒绝执行（本地测试用 CNINFO_ALLOW_PRIVATE_ORIGIN=1 豁免）
  if (process.env.CNINFO_ALLOW_PRIVATE_ORIGIN !== '1') {
    const origins = [process.env.CNINFO_ORIGIN, process.env.CNINFO_STATIC_ORIGIN].filter(
      (v): v is string => Boolean(v),
    );
    for (const origin of origins) {
      const reason = egressBlockReason(origin);
      if (reason) {
        const message = `${reason}: ${origin}`;
        if (jsonMode) {
          process.stdout.write(JSON.stringify({ type: 'error', message }) + '\n');
        } else {
          console.error(`[fatal] ${message}`);
        }
        process.exitCode = 1;
        return;
      }
    }
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
