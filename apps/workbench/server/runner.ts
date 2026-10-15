/** Runner：spawn 子进程执行采集，按行回吐 NDJSON；cancel 走 SIGTERM→宽限→SIGKILL。 */
import { spawn } from 'node:child_process';
import path from 'node:path';

import { paramsToCliArgs, type CninfoTaskParams, type TaskParams, type WebScraperParams } from '../shared/task-params.js';
import type { Runner } from './queue.js';

export interface SpawnSpec {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

export interface RunExit {
  code: number | null;
  signal: NodeJS.Signals | null;
}

/** spawnRunner 返回的句柄比队列要求的 RunningHandle 更具体（带退出码/信号）。 */
export interface SpawnHandle {
  done: Promise<RunExit>;
  cancel: () => void;
  pid?: number;
}

/** 任务级超时默认值：60 分钟（cninfo 多公司长任务可达数十分钟；任务参数 timeoutMs 可覆盖）。 */
export const DEFAULT_TASK_TIMEOUT_MS = 60 * 60 * 1000;

export function spawnRunner(spec: SpawnSpec, opts: { killGraceMs?: number; timeoutMs?: number } = {}) {
  const grace = opts.killGraceMs ?? 5000;
  return (_task: unknown, emit: (line: string) => void): SpawnHandle => {
    // detached：子进程自成进程组，终止信号可覆盖孙进程
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: { ...process.env, ...spec.env },
      detached: true,
    });
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d;
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) emit(line);
      }
    });
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d;
      if (stderr.length > 8000) stderr = stderr.slice(-4000);
    });
    let exited = false;
    const done = new Promise<RunExit>((resolve) => {
      // spawn 同步失败（如命令不存在）走 'error'，转成 error 事件行，不抛 unhandled
      child.on('error', (err) => {
        exited = true;
        emit(JSON.stringify({ type: 'error', message: `采集进程启动失败：${err.message}` }));
        resolve({ code: null, signal: null });
      });
      child.on('close', (code, signal) => {
        if (exited) return; // 'error' 已结案（close 可能随后再触发一次）
        exited = true;
        if (buf.trim()) emit(buf.trim());
        if (stderr.trim()) emit(JSON.stringify({ type: 'stderr', text: stderr.trim() }));
        resolve({ code, signal });
      });
    });
    let canceled = false;
    const killGroup = (signal: NodeJS.Signals) => {
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, signal);
      } catch {
        // 进程组已不存在（ESRCH）：与已退出的 child.kill 语义对齐，容错跳过
      }
    };
    // 取消与超时共用的终止路径；重复触发幂等
    const terminate = () => {
      if (canceled || exited) return;
      canceled = true;
      killGroup('SIGTERM');
      const timer = setTimeout(() => {
        if (!exited) killGroup('SIGKILL');
      }, grace);
      timer.unref();
    };
    const cancel = terminate;
    let timeoutTimer: NodeJS.Timeout | undefined;
    if (opts.timeoutMs !== undefined) {
      timeoutTimer = setTimeout(() => {
        if (exited) return;
        emit(
          JSON.stringify({
            type: 'error',
            message: `任务超时（${opts.timeoutMs} ms），已终止子进程`,
          }),
        );
        terminate();
      }, opts.timeoutMs);
      timeoutTimer.unref();
    }
    const clearTimeoutTimer = () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
    };
    child.on('close', clearTimeoutTimer);
    child.on('error', clearTimeoutTimer);
    return { done, cancel, pid: child.pid };
  };
}

/**
 * 根据任务参数多态类型构建子进程运行规范。
 */
export function buildCrawlerSpawnSpec(
  task: { params: TaskParams; dryRun: boolean; outDir: string },
  repoRoot: string,
): SpawnSpec {
  const sourceType = task.params.sourceType ?? 'cninfo';

  if (sourceType === 'cninfo') {
    const crawlerDir = path.join(repoRoot, 'crawlers', 'cninfo-reports');
    const entry = path.join(crawlerDir, 'src', 'main.ts');
    return {
      command: process.execPath,
      args: [
        '--import',
        'tsx',
        entry,
        '--json',
        ...paramsToCliArgs(task.params as CninfoTaskParams, task.dryRun),
        '-o',
        task.outDir,
      ],
      cwd: crawlerDir,
    };
  }

  if (sourceType === 'api-connector') {
    const crawlerDir = path.join(repoRoot, 'crawlers', 'api-connector');
    const entry = path.join(crawlerDir, 'src', 'main.ts');
    const args = [
      '--import',
      'tsx',
      entry,
      '--json',
      '--config-json',
      JSON.stringify(task.params),
      '-o',
      task.outDir,
    ];
    if (task.dryRun) {
      args.push('--dry-run');
    }
    return {
      command: process.execPath,
      args,
      cwd: crawlerDir,
    };
  }

  if (sourceType === 'web-scraper') {
    const crawlerDir = path.join(repoRoot, 'crawlers', 'firecrawl-scraper');
    const entry = path.join(crawlerDir, 'src', 'main.ts');
    const webParams = task.params as WebScraperParams;
    const args = [
      '--import',
      'tsx',
      entry,
      '--json',
      '--urls',
      webParams.urls.join(','),
      '-o',
      task.outDir,
    ];
    if (webParams.mock ?? true) {
      args.push('--mock');
    }
    if (webParams.analyze ?? true) {
      args.push('--analyze');
    }
    if (webParams.baselineBrand) {
      args.push('--baseline', webParams.baselineBrand);
    }
    const env: NodeJS.ProcessEnv = {};
    if (webParams.apiKey) {
      env.FIRECRAWL_API_KEY = webParams.apiKey;
    }
    if (webParams.baseUrl) {
      env.FIRECRAWL_BASE_URL = webParams.baseUrl;
      args.push('--base-url', webParams.baseUrl);
    }
    return {
      command: process.execPath,
      args,
      cwd: crawlerDir,
      env: Object.keys(env).length > 0 ? env : undefined,
    };
  }

  throw new Error(`不支持的数据源类型: ${sourceType}`);
}

/** 生产 Runner：根据 sourceType 分发到对应爬虫子进程（--json），任务输出隔离到 task.outDir。 */
export function makeCrawlerRunner(opts: { repoRoot: string }): Runner {
  return (task, emit) => {
    const spec = buildCrawlerSpawnSpec(task, opts.repoRoot);
    const timeoutMs = task.params.timeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;
    return spawnRunner(spec, { timeoutMs })(task, emit);
  };
}
