import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ApiConnectorParams } from './domain/types.js';
import { validateApiConnectorParams } from './domain/validation.js';

export interface CliOptions {
  params?: ApiConnectorParams;
  outDir: string;
  dryRun: boolean;
  json: boolean;
  help?: boolean;
}

export const USAGE = `用法：pnpm --filter api-connector start -- [选项]

选项：
      --config-json <json>   声明式 API 采集参数 JSON 字符串
      --config <path>        声明式 API 采集参数 JSON 文件路径
      --dry-run              只统计分页与清单，不下载文件、不写入磁盘
      --json                 输出 NDJSON 结构化事件（供工作台等程序消费）
  -o, --out <dir>            输出根目录，默认 <仓库根>/data/api-connector
  -h, --help                 显示本帮助

示例：
  pnpm --filter api-connector start -- --config-json '{"name":"示例","request":{"url":"...","method":"GET"},...}' --dry-run
`;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export function parseArgs(argv: string[]): CliOptions {
  let configJson: string | undefined;
  let configPath: string | undefined;
  let outDir = path.join(repoRoot, 'data', 'api-connector');
  let dryRun = false;
  let json = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      help = true;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '-o' || arg === '--out') {
      const next = argv[++i];
      if (!next || next.startsWith('-')) {
        throw new Error(`${arg} 需要提供目录路径`);
      }
      outDir = path.resolve(process.cwd(), next);
    } else if (arg === '--config-json') {
      const next = argv[++i];
      if (!next) {
        throw new Error('--config-json 需要提供 JSON 字符串');
      }
      configJson = next;
    } else if (arg === '--config') {
      const next = argv[++i];
      if (!next) {
        throw new Error('--config 需要提供文件路径');
      }
      configPath = next;
    } else if (arg.startsWith('-')) {
      throw new Error(`未知选项: ${arg}`);
    }
  }

  if (help) {
    return { outDir, dryRun, json, help: true };
  }

  let rawParams: unknown;
  if (configJson) {
    try {
      rawParams = JSON.parse(configJson);
    } catch {
      throw new Error('--config-json 提供的不是合法 JSON 文本');
    }
  } else if (configPath) {
    try {
      const fileContent = readFileSync(path.resolve(process.cwd(), configPath), 'utf8');
      rawParams = JSON.parse(fileContent);
    } catch (readErr) {
      const msg = readErr instanceof Error ? readErr.message : String(readErr);
      throw new Error(`读取配置文件失败 (${configPath}): ${msg}`);
    }
  } else {
    throw new Error('必须提供 --config-json 或 --config 参数以指定采集配置');
  }

  const params = rawParams as ApiConnectorParams;
  if (!params || typeof params !== 'object') {
    throw new Error('采集配置必须为 JSON 对象');
  }

  const errors = validateApiConnectorParams(params);
  if (errors.length > 0) {
    throw new Error(errors.join('；'));
  }

  return {
    params,
    outDir,
    dryRun,
    json,
  };
}
