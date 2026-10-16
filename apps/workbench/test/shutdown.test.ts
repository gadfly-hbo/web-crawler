/** Ctrl-C 关停清理（G1-G4/G6）：installSignalHandlers 例程单测 + TaskQueue.interruptActive 两阶段断言。 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { TaskQueue, type Runner } from '../server/queue.js';
import { installSignalHandlers } from '../server/shutdown.js';

function hangRunner(cancels: string[]): Runner {
  return (task, _emit) => {
    let resolveDone!: () => void;
    const done = new Promise<void>((r) => (resolveDone = r));
    return {
      done,
      cancel: () => {
        cancels.push(task.id);
        resolveDone();
      },
    };
  };
}

const PARAMS = {
  companies: ['平安银行'],
  industries: [],
  year: 2024,
  types: ['annual'],
  sleepMs: 0,
};

test('installSignalHandlers: SIGINT/SIGTERM/SIGHUP 各信号触发关停流程（interrupt→close→exit 0）', async () => {
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as NodeJS.Signals[]) {
    const calls: string[] = [];
    const uninstall = installSignalHandlers({
      queue: {
        interruptActive: async () => {
          calls.push('interrupt');
        },
        close: async () => {
          calls.push('close');
        },
      },
      exit: (code) => {
        calls.push(`exit:${code}`);
      },
    });
    process.emit(sig);
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(calls, ['interrupt', 'close', 'exit:0'], `${sig} 应走完整关停流程`);
    uninstall();
  }
});

test('installSignalHandlers: 双击强退 exit(130)，不等待关停流程', async () => {
  const calls: string[] = [];
  let release!: () => void;
  const slowClose = new Promise<void>((r) => (release = r));
  const uninstall = installSignalHandlers({
    queue: {
      interruptActive: async () => {
        calls.push('interrupt');
      },
      close: async () => {
        calls.push('close');
        await slowClose;
      },
    },
    exit: (code) => {
      calls.push(`exit:${code}`);
    },
  });
  process.emit('SIGINT');
  await new Promise((r) => setTimeout(r, 10));
  process.emit('SIGINT'); // 关停流程未完时第二信号 → 立即强退
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(calls.includes('exit:130'), `第二信号应 exit(130)，实际：${calls}`);
  assert.ok(!calls.includes('exit:0'), '强退后不得再走优雅退出');
  release();
  uninstall();
});

test('installSignalHandlers: uninstall 移除全部信号注册（防测试污染）', async () => {
  const calls: string[] = [];
  const uninstall = installSignalHandlers({
    queue: { interruptActive: async () => {}, close: async () => {} },
    exit: (code) => {
      calls.push(`exit:${code}`);
    },
  });
  uninstall();
  process.emit('SIGINT');
  process.emit('SIGTERM');
  process.emit('SIGHUP');
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(calls, [], 'uninstall 后信号不得再触发');
});

test('interruptActive: 磁盘保持 running、重启 init 标中断失败（G4 两阶段）；关停中不拉起排队任务（G1）', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wb-shutdown-'));
  const cancels: string[] = [];
  const q = new TaskQueue({ runner: hangRunner(cancels), dataRoot: dir });
  await q.init();
  try {
    const t1 = await q.create(PARAMS as never, false);
    const t2 = await q.create(PARAMS as never, false);
    await new Promise((r) => setTimeout(r, 50));

    await q.interruptActive();
    await q.close();

    // 磁盘 raw：t1 保持 running（G1 抑制 onProcessDone 改写 + G2 等待落定后 flush）
    const raw = JSON.parse(await readFile(path.join(dir, 'workbench', 'tasks.json'), 'utf8')) as Array<{
      id: string;
      status: string;
    }>;
    const disk1 = raw.find((t) => t.id === t1.id);
    const disk2 = raw.find((t) => t.id === t2.id);
    assert.equal(disk1?.status, 'running', '被关停任务磁盘态应保持 running');
    assert.equal(disk2?.status, 'queued', '关停中不得拉起排队任务（G1 pump 守卫）');
    assert.deepEqual(cancels, [t1.id], '仅活动任务被 terminate');

    // 两阶段第二步：新队列 init 按既有重启恢复语义标中断失败
    const q2 = new TaskQueue({ runner: hangRunner([]), dataRoot: dir });
    await q2.init();
    const boot1 = q2.get(t1.id);
    assert.equal(boot1?.status, 'failed');
    assert.equal(boot1?.error, '服务重启导致任务中断');
    await q2.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
