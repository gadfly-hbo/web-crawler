/**
 * api-connector：通用声明式 API 数据采集引擎 CLI 入口。
 */
import process from 'node:process';

import { parseArgs, USAGE, type CliOptions } from './cli.js';
import { runApiConnector } from './engine.js';
import { ndjsonReporter, textReporter } from './reporter.js';

export { runApiConnector } from './engine.js';
export { ndjsonReporter, textReporter, type Reporter } from './reporter.js';

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((a) => a !== '--');
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
    const summary = await runApiConnector({
      params: opts.params!,
      reporter,
      outDir: opts.outDir,
      dryRun: opts.dryRun,
    });
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
