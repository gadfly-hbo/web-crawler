import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseArgs } from '../src/cli.js';
import { parseCrawlEvent, type CrawlEvent } from '../src/events.js';
import type { ApiConnectorParams } from '../src/domain/index.js';

const selfDir = path.dirname(fileURLToPath(import.meta.url));
const mainPath = path.join(selfDir, '..', 'src', 'main.ts');

function validConfig(): ApiConnectorParams {
  return {
    sourceType: 'api-connector',
    name: 'CLI测试数据源',
    request: {
      url: 'https://httpbin.org/get?page={{page}}',
      method: 'GET',
    },
    pagination: {
      type: 'page_number',
      pageParam: 'page',
      startPage: 1,
      pageSize: 10,
      maxPages: 1,
    },
    extraction: {
      listPath: 'args',
      titlePath: 'page',
    },
    sleepMs: 200,
  };
}

test('parseArgs: -h/--help 返回 help: true 且不抛出错误', () => {
  assert.equal(parseArgs(['-h']).help, true);
  assert.equal(parseArgs(['--help']).help, true);
});

test('parseArgs: 正常解析合法 --config-json', () => {
  const config = validConfig();
  const res = parseArgs(['--config-json', JSON.stringify(config), '--dry-run', '--json']);
  assert.equal(res.dryRun, true);
  assert.equal(res.json, true);
  assert.equal(res.params?.name, 'CLI测试数据源');
});

test('parseArgs: 缺少配置或非法 JSON 抛出明确异常', () => {
  assert.throws(() => parseArgs([]), /必须提供 --config-json 或 --config 参数/);
  assert.throws(() => parseArgs(['--config-json', '{not-json']), /不是合法 JSON 文本/);
});

test('parseArgs: 业务参数校验不通过时抛出异常', () => {
  const bad = validConfig();
  bad.sleepMs = 50; // 低于 200ms
  assert.throws(() => parseArgs(['--config-json', JSON.stringify(bad)]), /请求间隔不能低于 200ms/);
});

function runCli(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const cp = spawn(process.execPath, ['--import', 'tsx', mainPath, ...args]);
    let stdout = '';
    let stderr = '';
    cp.stdout?.on('data', (d) => (stdout += d.toString()));
    cp.stderr?.on('data', (d) => (stderr += d.toString()));
    cp.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('CLI: --json 参数非法时输出 error 事件且退出码为 1', async () => {
  const { code, stdout } = await runCli(['--json', '--config-json', '{"invalid": true}']);
  assert.equal(code, 1);
  const event = parseCrawlEvent(stdout.trim());
  assert.ok(event);
  assert.equal(event?.type, 'error');
});

test('CLI: -h 打印帮助并以 0 退出', async () => {
  const { code, stdout } = await runCli(['-h']);
  assert.equal(code, 0);
  assert.ok(stdout.includes('用法：'));
});
