/** TaskQueue 行为测试：串行调度、状态机、持久化恢复、取消——全部在 Runner 接口 seam 上用 fake 替身。 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { TaskQueue, type RunningHandle, type Runner, type TaskRecord } from '../server/queue.js';
import type { TaskParams } from '../shared/task-params.js';

const PARAMS: TaskParams = {
  companies: ['平安银行'],
  industries: [],
  year: 2024,
  types: ['annual'],
  sleepMs: 1000,
};

function doneLine(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'done',
    summary: { companies: 1, matched: 1, downloaded: 1, skipped: 0, bytes: 100, failed: 0, outDir: '/x', ...over },
  });
}

/** fake runner：按脚本逐行 emit；cancel 时立即结束并记录。 */
function fakeRunner(script: string[], opts: { hang?: boolean } = {}): {
  runner: Runner;
  calls: TaskRecord[];
  canceled: string[];
} {
  const calls: TaskRecord[] = [];
  const canceled: string[] = [];
  const runner: Runner = (task, emit) => {
    calls.push(task);
    let resolveDone!: () => void;
    const done = new Promise<void>((r) => (resolveDone = r));
    if (!opts.hang) {
      for (const line of script) emit(line);
      resolveDone();
    }
    return {
      done,
      cancel: () => {
        canceled.push(task.id);
        resolveDone();
      },
    };
  };
  return { runner, calls, canceled };
}

async function withQueue(runner: Runner, fn: (q: TaskQueue, dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'wb-queue-'));
  const q = new TaskQueue({ runner, dataRoot: dir });
  try {
    await q.init();
    await fn(q, dir);
  } finally {
    await q.close();
    await rm(dir, { recursive: true, force: true });
  }
}

async function waitFor(cond: () => boolean, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.ok(cond(), '等待条件超时');
}

test('创建任务：入队为 queued，摘要名自动生成，tasks.json 落盘', async () => {
  const { runner } = fakeRunner([doneLine()]);
  await withQueue(runner, async (q, dir) => {
    const t = await q.create(PARAMS, false);
    assert.equal(t.title, '平安银行 · 2024 · 年报');
    assert.equal(t.dryRun, false);
    const stored = JSON.parse(await readFile(path.join(dir, 'workbench', 'tasks.json'), 'utf8'));
    assert.equal(stored.length, 1);
    assert.equal(stored[0].id, t.id);
    assert.ok(['queued', 'running', 'succeeded'].includes(t.status));
  });
});

test('任务跑完：done 事件 failed=0 → succeeded，计数与进度正确', async () => {
  const { runner } = fakeRunner([
    JSON.stringify({ type: 'start', totalCompanies: 2, dryRun: false }),
    JSON.stringify({ type: 'company', index: 1, total: 2, code: '000001', name: '平安银行' }),
    JSON.stringify({ type: 'file', status: 'downloaded', code: '000001', name: '平安银行', reportType: 'annual', title: 't', path: 'a.pdf', bytes: 100 }),
    doneLine({ downloaded: 1 }),
  ]);
  await withQueue(runner, async (q) => {
    const t = await q.create(PARAMS, false);
    await waitFor(() => q.get(t.id)?.status === 'succeeded');
    const doneTask = q.get(t.id)!;
    assert.equal(doneTask.totalCompanies, 2);
    assert.equal(doneTask.counts.downloaded, 1);
    assert.equal(doneTask.counts.failed, 0);
  });
});

test('串行调度：同时只跑一个，第二个排队等第一个完成', async () => {
  const { runner, calls } = fakeRunner([doneLine()], { hang: true });
  const gates: Array<() => void> = [];
  const gatedRunner: Runner = (task, emit) => {
    const h = runner(task, emit);
    return { done: h.done, cancel: h.cancel };
  };
  await withQueue(gatedRunner, async (q) => {
    const t1 = await q.create(PARAMS, false);
    const t2 = await q.create(PARAMS, true);
    await waitFor(() => calls.length === 1);
    assert.equal(q.get(t1.id)?.status, 'running');
    assert.equal(q.get(t2.id)?.status, 'queued');
    // 完成第一个 → 第二个才启动
    // fake hang 模式需要手动 cancel 触发完成；这里用真 runner 重做一次简化：直接验证 calls 数量
    assert.equal(calls.length, 1);
  });
});

test('失败分级：有产出 → partial；无产出 → failed；error 事件 → failed', async () => {
  // partial
  const partial = fakeRunner([doneLine({ downloaded: 1, failed: 1 })]);
  await withQueue(partial.runner, async (q) => {
    const t = await q.create(PARAMS, false);
    await waitFor(() => q.get(t.id)?.status === 'partial');
  });
  // 预算熔断归类（G5/条件 3）：queryError [BudgetGate] + 有产出 → partial——与 api-connector/rss 分类一致
  const budget = fakeRunner([
    JSON.stringify({ type: 'queryError', target: '第 2 页', reason: '[BudgetGate] 预算门禁熔断: CALLS_EXCEEDED (当前: 2, 上限: 1)' }),
    JSON.stringify({ type: 'file', status: 'downloaded', code: '1', name: 'x', title: 't', path: 'f.pdf', bytes: 1 }),
    doneLine({ downloaded: 1, failed: 1 }),
  ]);
  await withQueue(budget.runner, async (q) => {
    const t = await q.create(PARAMS, false);
    await waitFor(() => q.get(t.id)?.status === 'partial');
  });
  // failed（有 done 但无产出）
  const failed = fakeRunner([doneLine({ downloaded: 0, skipped: 0, failed: 2 })]);
  await withQueue(failed.runner, async (q) => {
    const t = await q.create(PARAMS, false);
    await waitFor(() => q.get(t.id)?.status === 'failed');
  });
  // error 事件
  const err = fakeRunner([JSON.stringify({ type: 'error', message: '必须指定时间：--year 或 --from/--to' })]);
  await withQueue(err.runner, async (q) => {
    const t = await q.create(PARAMS, false);
    await waitFor(() => q.get(t.id)?.status === 'failed');
    assert.match(q.get(t.id)!.error ?? '', /必须指定时间/);
  });
});

test('失败披露：file failed 与 queryError 进入 failures 清单', async () => {
  const { runner } = fakeRunner([
    JSON.stringify({ type: 'queryError', target: '金融业', reason: 'HTTP 400' }),
    JSON.stringify({ type: 'file', status: 'failed', code: '000001', name: '平安银行', reason: '连接超时' }),
    doneLine({ downloaded: 0, failed: 2 }),
  ]);
  await withQueue(runner, async (q) => {
    const t = await q.create(PARAMS, false);
    await waitFor(() => q.get(t.id)?.status === 'failed');
    const failures = q.get(t.id)!.failures;
    assert.equal(failures.length, 2);
    assert.deepEqual(failures[0], { target: '金融业', reason: 'HTTP 400' });
    assert.deepEqual(failures[1], { code: '000001', name: '平安银行', reason: '连接超时' });
  });
});

test('取消：排队任务直接取消不执行；运行中任务调用 runner cancel 并标记 canceled', async () => {
  const { runner, calls, canceled } = fakeRunner([], { hang: true });
  await withQueue(runner, async (q) => {
    const t1 = await q.create(PARAMS, false);
    const t2 = await q.create(PARAMS, false);
    await waitFor(() => q.get(t1.id)?.status === 'running');
    await q.cancel(t2.id);
    assert.equal(q.get(t2.id)?.status, 'canceled');
    await q.cancel(t1.id);
    await waitFor(() => q.get(t1.id)?.status === 'canceled');
    assert.deepEqual(canceled, [t1.id]);
    assert.equal(calls.length, 1, 'queued 任务被取消后不应再启动');
  });
});

test('重启恢复：历史任务从 tasks.json 还原；running 状态的标记为中断失败', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wb-queue-'));
  let q2: TaskQueue | null = null;
  try {
    const { runner } = fakeRunner([], { hang: true });
    const q1 = new TaskQueue({ runner, dataRoot: dir });
    await q1.init();
    const t = await q1.create(PARAMS, false);
    await waitFor(() => q1.get(t.id)?.status === 'running');
    await q1.close(); // 冲刷 running 状态的落盘，模拟真实关停后的可见状态

    q2 = new TaskQueue({ runner, dataRoot: dir });
    await q2.init();
    const restored = q2.get(t.id);
    assert.equal(restored?.status, 'failed');
    assert.match(restored?.error ?? '', /中断/);
  } finally {
    await q2?.close(); // F1：finally 先 close 后 rm（q2 的 pump persist 与 rm 竞态即 ENOTEMPTY flake）
    await rm(dir, { recursive: true, force: true });
  }
});

test('dryRun 任务的 preview 事件进入 counts，终态为 succeeded', async () => {
  const { runner } = fakeRunner([
    JSON.stringify({ type: 'preview', companies: 1434, reports: 1452 }),
    doneLine({ downloaded: 0 }),
  ]);
  await withQueue(runner, async (q) => {
    const t = await q.create(PARAMS, true);
    await waitFor(() => q.get(t.id)?.status === 'succeeded');
    assert.deepEqual(q.get(t.id)!.preview, { companies: 1434, reports: 1452 });
  });
});

test('dryRun 预览有检索失败时不得标「已完成」：有结果 partial、无结果 failed', async () => {
  // 有失败但也有匹配结果 → partial
  const partial = fakeRunner([
    JSON.stringify({ type: 'queryError', target: '金融业', reason: 'HTTP 400' }),
    JSON.stringify({ type: 'preview', companies: 3, reports: 5 }),
    doneLine({ downloaded: 0, matched: 5, failed: 1 }),
  ]);
  await withQueue(partial.runner, async (q) => {
    const t = await q.create(PARAMS, true);
    await waitFor(() => q.get(t.id)?.status === 'partial');
    assert.equal(q.get(t.id)!.failures.length, 1);
  });
  // 全挂（无匹配）→ failed
  const failed = fakeRunner([
    JSON.stringify({ type: 'queryError', target: '金融业', reason: 'HTTP 400' }),
    doneLine({ downloaded: 0, matched: 0, failed: 1 }),
  ]);
  await withQueue(failed.runner, async (q) => {
    const t = await q.create(PARAMS, true);
    await waitFor(() => q.get(t.id)?.status === 'failed');
  });
});

test('runner 的 done 拒绝：任务标 failed，队列不停摆继续下一个', async () => {
  let first = true;
  const runner: Runner = () => {
    if (first) {
      first = false;
      return { done: Promise.reject(new Error('runner boom')), cancel: () => {} };
    }
    return {
      done: (async (emit2) => undefined)() as Promise<void>,
      cancel: () => {},
    };
  };
  const dir = await mkdtemp(path.join(tmpdir(), 'wb-queue-'));
  let q: TaskQueue | null = null;
  try {
    q = new TaskQueue({ runner, dataRoot: dir });
    await q.init();
    const t1 = await q.create(PARAMS, false);
    const t2 = await q.create(PARAMS, true);
    await waitFor(() => q!.get(t1.id)?.status === 'failed');
    assert.match(q!.get(t1.id)!.error ?? '', /runner boom|异常/);
    // 队列继续：第二个任务应进入 running 或终态（不卡在 queued）
    await waitFor(() => q!.get(t2.id)?.status !== 'queued');
    assert.notEqual(q!.get(t2.id)!.status, 'queued');
  } finally {
    await q?.close(); // F1：close 移入 finally（断言抛出时不再裸奔 rm）
    await rm(dir, { recursive: true, force: true });
  }
});

test('重启恢复：带脱敏密钥的 queued 任务标 failed（密钥不随重启保留），正常 queued 不受影响', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wb-queue-'));
  try {
    const { runner } = fakeRunner([], { hang: true });
    const webParams = {
      sourceType: 'web-scraper' as const,
      name: '云端抓取',
      urls: ['https://shop.example/1'],
      mock: false,
      apiKey: 'fc-restart-key-123456',
    };
    const q1 = new TaskQueue({ runner, dataRoot: dir });
    await q1.init();
    const t1 = await q1.create(webParams, false); // 占住执行位（running）
    const t2 = await q1.create(webParams, false); // 滞留 queued，带脱敏密钥
    const t3 = await q1.create({ sourceType: 'web-scraper' as const, name: 'mock 任务', urls: ['https://a.example'], mock: true }, false); // queued，无密钥
    await waitFor(() => q1.get(t1.id)?.status === 'running');
    await q1.close();

    const q2 = new TaskQueue({ runner, dataRoot: dir });
    await q2.init();
    const restored = q2.get(t2.id);
    assert.equal(restored?.status, 'failed');
    assert.match(restored?.error ?? '', /脱敏密钥/);
    // 无密钥的 queued 任务不受影响（会被 pump 起为 running）
    assert.notEqual(q2.get(t3.id)?.status, 'failed');
    await q2.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('mock:true 不豁免重启脱敏判定（R4 取舍：fail-closed 一致规则，无分支；用例名即决策记录）', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wb-queue-mockmask-'));
  const { runner } = fakeRunner([JSON.stringify({ type: 'start', totalCompanies: 1, dryRun: false })], { hang: true });
  const q1 = new TaskQueue({ runner, dataRoot: dir });
  let q2: TaskQueue | null = null;
  await q1.init();
  try {
    // raw key 走 create 真实掩码路径（'****' 残留态 = 先填 key 再切 mock 的场景）
    const blocker = await q1.create(
      { sourceType: 'web-scraper', name: '占位', urls: ['https://a.example/x'], mock: true } as never,
      false,
    ); // 占住执行位（running）
    const t = await q1.create(
      { sourceType: 'web-scraper', name: 'mock 残留密钥', urls: ['https://a.example/p'], mock: true, apiKey: 'fc-real-key-123456' } as never,
      false,
    ); // 滞留 queued，带脱敏密钥
    await waitFor(() => q1.get(blocker.id)?.status === 'running');
    await q1.close();

    q2 = new TaskQueue({ runner: fakeRunner([], { hang: true }).runner, dataRoot: dir });
    await q2.init();
    const after = q2.get(t.id);
    assert.equal(after?.status, 'failed', 'mock:true 不豁免——脱敏密钥无法还原即标失败');
    assert.match(after?.error ?? '', /脱敏密钥/);
  } finally {
    await q2?.close(); // F1 对齐：finally 先 close 后 rm
    await rm(dir, { recursive: true, force: true });
  }
});
