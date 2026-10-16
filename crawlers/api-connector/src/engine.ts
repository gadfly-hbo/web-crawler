/**
 * 通用声明式 API 数据采集引擎。
 * 驱动自动分页循环，支持模板插值、熔断保护、附件原子落盘与强类型 CrawlEvent 发射。
 */
import { appendFile, mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { CrawlEvent, CrawlSummary, Reporter } from './events.js';
import { extractArray, extractPath, extractString } from './json-path.js';
import type { ApiConnectorParams } from './domain/index.js';
import { egressBlockReason } from 'data-governance/egress';

export interface RunApiConnectorOptions {
  params: ApiConnectorParams;
  reporter: Reporter;
  outDir: string;
  dryRun?: boolean;
  fetchFn?: typeof fetch;
  /** 预算池注入（测试 seam，G5/G7）：显式传入替换该场景池；缺省按公式建池 */
  budgets?: { pagination?: BudgetCounter; download?: BudgetCounter };
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|\r\n]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function inferExtension(urlStr: string): string {
  try {
    const p = new URL(urlStr).pathname;
    const ext = path.extname(p);
    if (ext && ext.length <= 6) return ext;
  } catch {}
  return '.pdf';
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const s = await stat(filePath);
    return s.isFile();
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_REDIRECT_HOPS = 5;

export interface BudgetCounter {
  checkAndReserve(tokens: number): void;
  recordUsage(usage: { tokens: number }): void;
}

/**
 * 出口门禁包裹的 fetch：每跳先查守卫、redirect 自行逐跳跟随（303→GET，301/302 POST→GET），
 * 每跳计入预算；命中内网/回环或超跳数即抛错。
 */
async function guardedFetch(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit | undefined,
  budgetGate: BudgetCounter,
): Promise<Response> {
  let currentUrl = url;
  let currentInit = init;
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    const reason = egressBlockReason(currentUrl);
    if (reason) {
      throw new Error(reason);
    }
    budgetGate.checkAndReserve(100);
    const res = await fetchFn(currentUrl, { ...currentInit, redirect: 'manual' });
    budgetGate.recordUsage({ tokens: 100 });

    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      if (hop === MAX_REDIRECT_HOPS) {
        throw new Error(`重定向次数超过上限（${MAX_REDIRECT_HOPS}）`);
      }
      const nextUrl = new URL(location, currentUrl).toString();
      if (
        res.status === 303 ||
        ((res.status === 301 || res.status === 302) && currentInit?.method === 'POST')
      ) {
        const headers = { ...((currentInit?.headers as Record<string, string>) ?? {}) };
        delete headers['Content-Type'];
        delete headers['content-type'];
        currentInit = { ...currentInit, method: 'GET', body: undefined, headers };
      }
      currentUrl = nextUrl;
      continue;
    }
    return res;
  }
  throw new Error(`重定向次数超过上限（${MAX_REDIRECT_HOPS}）`);
}

/**
 * 构建带模板插值的请求参数。
 */
export function buildRequest(
  params: ApiConnectorParams,
  page: number,
  pageSize: number,
): { url: string; init: RequestInit } {
  const { request, pagination } = params;
  let urlStr = request.url;
  const hasPagePlaceholder = urlStr.includes('{{page}}');
  const hasPageSizePlaceholder = urlStr.includes('{{pageSize}}');

  if (hasPagePlaceholder) {
    urlStr = urlStr.replace(/\{\{page\}\}/g, String(page));
  }
  if (hasPageSizePlaceholder) {
    urlStr = urlStr.replace(/\{\{pageSize\}\}/g, String(pageSize));
  }

  const method = request.method.toUpperCase();
  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    ...(request.headers ?? {}),
  };

  let body: string | undefined = undefined;

  if (method === 'GET') {
    try {
      const parsed = new URL(urlStr);
      if (!hasPagePlaceholder && pagination.pageParam) {
        parsed.searchParams.set(pagination.pageParam, String(page));
      }
      if (!hasPageSizePlaceholder && pagination.pageSizeParam) {
        parsed.searchParams.set(pagination.pageSizeParam, String(pageSize));
      }
      urlStr = parsed.toString();
    } catch {
      // 容错给 fetch 抛出具体 URL 错误
    }
  } else if (method === 'POST') {
    if (request.bodyTemplate) {
      body = request.bodyTemplate
        .replace(/\{\{page\}\}/g, String(page))
        .replace(/\{\{pageSize\}\}/g, String(pageSize));
    } else {
      const payload: Record<string, unknown> = {};
      if (pagination.pageParam) payload[pagination.pageParam] = page;
      if (pagination.pageSizeParam) payload[pagination.pageSizeParam] = pageSize;
      body = JSON.stringify(payload);
    }
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  return {
    url: urlStr,
    init: {
      method,
      headers,
      body,
    },
  };
}

/**
 * 执行通用 API 数据采集任务。
 */
export async function runApiConnector(options: RunApiConnectorOptions): Promise<CrawlSummary> {
  const { params, reporter, outDir, dryRun = false, fetchFn = fetch } = options;

  const summary: CrawlSummary = {
    companies: 1,
    matched: 0,
    downloaded: 0,
    skipped: 0,
    bytes: 0,
    failed: 0,
    outDir,
  };

  reporter({ type: 'start', totalCompanies: 1, dryRun });
  reporter({ type: 'company', index: 1, total: 1, code: 'API', name: params.name });

  const maxPages = Math.min(Math.max(params.pagination.maxPages ?? 50, 1), 200);
  const startPage = params.pagination.startPage || 1;
  const pageSize = params.pagination.pageSize || 20;

  const safeDirName = sanitizeFilename(params.name) || 'api-output';
  const reportsDir = path.join(outDir, safeDirName);
  const indexPath = path.join(outDir, 'index.jsonl');

  if (!dryRun) {
    await mkdir(reportsDir, { recursive: true });
    await mkdir(outDir, { recursive: true });
  }

  const { BudgetGate } = await import('data-governance/budget');
  // N2 预算分池（PRD 决策 1）：每请求 worst-case 1+5 跳；显式关闭无意义的 token/cost 估计（条件 1，探针 C 的 500 跳硬顶反例）
  const hopAllowance = 1 + MAX_REDIRECT_HOPS;
  const paginationBudget =
    options.budgets?.pagination ??
    new BudgetGate({ maxCalls: maxPages * hopAllowance, maxTokens: undefined, maxCostUsd: undefined });
  const downloadBudget =
    options.budgets?.download ??
    new BudgetGate({ maxCalls: pageSize * maxPages * hopAllowance, maxTokens: undefined, maxCostUsd: undefined });

  try {
    for (let page = startPage; page < startPage + maxPages; page++) {
      if (page > startPage && params.sleepMs > 0) {
        await sleep(params.sleepMs);
      }

      const { url, init } = buildRequest(params, page, pageSize);
      let res: Response;
      try {
        res = await guardedFetch(fetchFn, url, init, paginationBudget);
      } catch (netErr) {
        const reason = netErr instanceof Error ? netErr.message : String(netErr);
        reporter({ type: 'queryError', target: `第 ${page} 页`, reason });
        summary.failed++;
        break;
      }

      if (!res.ok) {
        reporter({
          type: 'queryError',
          target: `第 ${page} 页`,
          reason: `HTTP ${res.status} ${res.statusText}`,
        });
        summary.failed++;
        break;
      }

      let data: unknown;
      try {
        data = await res.json();
      } catch (jsonErr) {
        const reason = jsonErr instanceof Error ? jsonErr.message : String(jsonErr);
        reporter({ type: 'queryError', target: `第 ${page} 页`, reason: `JSON 解析失败: ${reason}` });
        summary.failed++;
        break;
      }

      const items = extractArray(data, params.extraction.listPath) ?? [];
      if (items.length === 0) {
        break;
      }

      summary.matched += items.length;

      if (!dryRun) {
        for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
          const item = items[itemIdx];
          const title = extractString(item, params.extraction.titlePath) || `item_${page}_${itemIdx + 1}`;
          const itemKey =
            (params.extraction.itemKeyPath ? extractString(item, params.extraction.itemKeyPath) : undefined) ||
            String(summary.matched - items.length + itemIdx + 1);
          const date = params.extraction.datePath ? extractString(item, params.extraction.datePath) : undefined;
          const rawUrl = params.extraction.downloadUrlPath
            ? extractString(item, params.extraction.downloadUrlPath)
            : undefined;

          const safeTitle = sanitizeFilename(title);

          if (rawUrl) {
            let downloadUrl: string;
            try {
              downloadUrl = new URL(rawUrl, url).toString();
            } catch {
              downloadUrl = rawUrl;
            }

            const ext = inferExtension(downloadUrl);
            const datePrefix = date ? `${sanitizeFilename(date)}_` : '';
            const fileName = `${datePrefix}${safeTitle || itemKey}${ext}`;
            const targetPath = path.join(reportsDir, fileName);
            const relPath = path.relative(outDir, targetPath);
            const partFile = `${targetPath}.part`;

            let itemStatus = 'downloaded';
            if (await fileExists(targetPath)) {
              itemStatus = 'skipped';
              summary.skipped++;
              reporter({
                type: 'file',
                status: 'skipped',
                code: itemKey,
                name: params.name,
                title,
                path: relPath,
              });
            } else {
              try {
                await unlink(partFile).catch(() => {});
                const fileRes = await guardedFetch(fetchFn, downloadUrl, undefined, downloadBudget);
                if (!fileRes.ok) {
                  throw new Error(`HTTP ${fileRes.status} ${fileRes.statusText}`);
                }
                const ab = await fileRes.arrayBuffer();
                const buf = Buffer.from(ab);
                await writeFile(partFile, buf);
                await rename(partFile, targetPath);

                summary.downloaded++;
                summary.bytes += buf.length;
                reporter({
                  type: 'file',
                  status: 'downloaded',
                  code: itemKey,
                  name: params.name,
                  title,
                  path: relPath,
                  bytes: buf.length,
                });
              } catch (fileErr) {
                await unlink(partFile).catch(() => {});
                summary.failed++;
                itemStatus = 'failed';
                const reason = fileErr instanceof Error ? fileErr.message : String(fileErr);
                reporter({
                  type: 'file',
                  status: 'failed',
                  code: itemKey,
                  name: params.name,
                  title,
                  path: relPath,
                  reason,
                });
              }
            }

            await appendFile(
              indexPath,
              JSON.stringify({
                time: new Date().toISOString(),
                status: itemStatus,
                key: itemKey,
                title,
                date,
                url: downloadUrl,
                file: relPath,
              }) + '\n',
              'utf8',
            );
          } else {
            // 无下载 URL，将单条记录数据保存为 JSON
            const fileName = `${itemKey}_${safeTitle}.json`;
            const targetPath = path.join(reportsDir, fileName);
            const relPath = path.relative(outDir, targetPath);
            const content = JSON.stringify(item, null, 2);

            if (await fileExists(targetPath)) {
              summary.skipped++;
              reporter({
                type: 'file',
                status: 'skipped',
                code: itemKey,
                name: params.name,
                title,
                path: relPath,
              });
            } else {
              await writeFile(targetPath, content, 'utf8');
              summary.downloaded++;
              summary.bytes += Buffer.byteLength(content, 'utf8');
              reporter({
                type: 'file',
                status: 'downloaded',
                code: itemKey,
                name: params.name,
                title,
                path: relPath,
                bytes: Buffer.byteLength(content, 'utf8'),
              });
            }

            await appendFile(
              indexPath,
              JSON.stringify({
                time: new Date().toISOString(),
                status: 'downloaded',
                key: itemKey,
                title,
                file: relPath,
              }) + '\n',
              'utf8',
            );
          }
        }
      }

      // 分页终止判定
      if (params.pagination.hasMorePath) {
        const hasMore = extractPath(data, params.pagination.hasMorePath);
        if (hasMore === false || hasMore === 'false') break;
      }
      if (params.pagination.totalPath) {
        const total = extractPath(data, params.pagination.totalPath);
        if (typeof total === 'number' && summary.matched >= total) break;
      }
      if (items.length < pageSize) {
        break;
      }
    }

    if (!dryRun && outDir) {
      try {
        const { createAndSaveDeliveryManifest } = await import('data-governance/manifest');
        const { readdir } = await import('node:fs/promises');
        const filesToSign: string[] = [];
        const scanFiles = async (dir: string, prefix: string) => {
          const entries = await readdir(dir, { withFileTypes: true });
          for (const e of entries) {
            if (e.name.startsWith('.') || e.name.endsWith('.tmp') || e.name === 'manifest.json') continue;
            if (e.isFile()) {
              filesToSign.push(prefix ? `${prefix}/${e.name}` : e.name);
            } else if (e.isDirectory()) {
              await scanFiles(path.join(dir, e.name), prefix ? `${prefix}/${e.name}` : e.name);
            }
          }
        };
        await scanFiles(outDir, '');

        if (filesToSign.length > 0) {
          await createAndSaveDeliveryManifest({
            dir: outDir,
            datasetId: path.basename(outDir),
            sourceType: 'api-connector',
            generatorName: 'api-connector',
            generatorVersion: '0.1.0',
            generatorDesc: '通用声明式 API 数据采集引擎',
            recordsCount: summary.downloaded + summary.skipped,
            validCount: summary.downloaded,
            filesToSign,
            schemaFields: [
              { name: 'key', type: 'string', description: '数据条目主键', nullable: false },
              { name: 'title', type: 'string', description: '条目标题', nullable: false },
              { name: 'file', type: 'string', description: '保存文件相对路径', nullable: false },
              { name: 'time', type: 'string', description: '抓取时间戳', nullable: false },
            ],
            limitations: [
              '响应内容按配置路径规则提取，字段缺失不推断不补全',
              '附件按原文件字节落盘，内容真实性与源站一致',
            ],
          });
        }
      } catch {
        // 容错：不影响正常执行
      }
    }

    if (dryRun) {
      reporter({ type: 'preview', companies: 1, reports: summary.matched });
    }
    reporter({ type: 'done', summary });
    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reporter({ type: 'error', message });
    throw err;
  }
}
