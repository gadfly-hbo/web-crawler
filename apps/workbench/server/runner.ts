/** Runner：spawn 子进程执行采集，按行回吐 NDJSON；cancel 走 SIGTERM→宽限→SIGKILL。 */
import { spawn } from 'node:child_process';
import path from 'node:path';

import { paramsToCliArgs } from '../shared/task-params.js';
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
}

export function spawnRunner(spec: SpawnSpec, opts: { killGraceMs?: number } = {}) {
  const grace = opts.killGraceMs ?? 5000;
  return (_task: unknown, emit: (line: string) => void): SpawnHandle => {
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: { ...process.env, ...spec.env },
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
    const cancel = () => {
      if (canceled || exited) return;
      canceled = true;
      child.kill('SIGTERM');
      const timer = setTimeout(() => {
        if (!exited) child.kill('SIGKILL');
      }, grace);
      timer.unref();
    };
    return { done, cancel };
  };
}

/** 生产 Runner：以 tsx 跑 cninfo-reports 爬虫（--json），任务输出隔离到 task.outDir。 */
export function makeCrawlerRunner(opts: { repoRoot: string }): Runner {
  const crawlerDir = path.join(opts.repoRoot, 'crawlers', 'cninfo-reports');
  const entry = path.join(crawlerDir, 'src', 'main.ts');
  return (task, emit) =>
    spawnRunner({
      command: process.execPath,
      args: ['--import', 'tsx', entry, '--json', ...paramsToCliArgs(task.params, task.dryRun), '-o', task.outDir],
      cwd: crawlerDir,
    })(task, emit);
}
