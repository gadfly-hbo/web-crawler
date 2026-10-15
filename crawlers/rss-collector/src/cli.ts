/** CLI 参数解析纯函数（--json 校验失败与运行失败语义见 main.ts / G11）。 */
export interface CliArgs {
  urls: string[];
  limit?: number;
  outDir: string;
  json: boolean;
  deadlineMs?: number;
  help: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { urls: [], outDir: '', json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '-h':
      case '--help':
        args.help = true;
        break;
      case '--urls': {
        const value = argv[++i];
        if (!value) throw new Error('--urls 不能为空：逗号分隔的已批准 Feed URL（1-5 个）');
        args.urls = value.split(',').map((u) => u.trim()).filter(Boolean);
        break;
      }
      case '--limit': {
        const value = argv[++i];
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 500) throw new Error('--limit 应为 1-500 的整数');
        args.limit = n;
        break;
      }
      case '-o':
      case '--out-dir': {
        const value = argv[++i];
        if (!value) throw new Error('--out-dir 不能为空');
        args.outDir = value;
        break;
      }
      case '--json':
        args.json = true;
        break;
      case '--deadline-ms': {
        const value = argv[++i];
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1) throw new Error('--deadline-ms 应为正整数（毫秒）');
        args.deadlineMs = n;
        break;
      }
      default:
        throw new Error(`未知参数: ${arg}`);
    }
  }
  if (args.help) return args;
  if (args.urls.length === 0) throw new Error('必须提供 --urls：逗号分隔的已批准 Feed URL（1-5 个）');
  if (!args.outDir) throw new Error('必须提供 -o/--out-dir 指定输出目录');
  return args;
}

export function usageText(): string {
  return [
    '用法：rss-collector --urls <url1,url2,...> -o <outDir> [--limit N] [--deadline-ms N] [--json]',
    '',
    '  --urls         逗号分隔的已批准 Feed URL（1-5 个，任务即白名单）',
    '  -o, --out-dir  输出目录（快照/证据/manifest 落盘于此）',
    '  --limit        每 Feed 条目上限（默认 50，最大 500）',
    '  --deadline-ms  整任务级软超时毫秒数（默认 60000）',
    '  --json         NDJSON 事件流模式（工作台消费）',
    '  -h, --help     显示帮助',
  ].join('\n');
}
