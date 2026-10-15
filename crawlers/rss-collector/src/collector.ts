/**
 * RSS 采集编排：校验期出口门禁 → manual 重定向逐跳守卫 → 快照 → 规则式抽取与证据
 * → 事件流（G5/G11 分界）→ manifest 交付。条目链接零跟随（A12/A20）。
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  EGRESS_PRIVATE_BLOCK_REASON,
  EGRESS_PROTOCOL_REASON,
  egressBlockReason,
} from 'data-governance/egress';
import { EvidenceIndexStore, locateSnippet, type FieldEvidence } from 'data-governance/evidence';
import { computeFileSha256, type DeliveryFieldSchema, type DeliveryManifest } from 'data-governance/manifest';
import { BudgetGate } from 'data-governance/budget';
import { SnapshotStorage } from 'data-governance/storage';

import type { FeedEntry } from './feed-parser.js';
import { parseFeed } from './feed-parser.js';
import type { RssEvent, RssSummary } from './events.js';

const MAX_REDIRECT_HOPS = 5;
const DEADLINE_REASON = 'DEADLINE_EXCEEDED';
const REDIRECT_LIMIT_REASON = 'REDIRECT_LIMIT_EXCEEDED';

export interface RssRecord {
  recordId: string;
  feedUrl: string;
  title: string | null;
  link: string | null;
  published: string | null;
  summary: string | null;
  qualityStatus: 'valid' | 'missing_field';
  missingReason?: string;
}

export interface CollectorResult {
  summary: RssSummary;
  records: RssRecord[];
  evidences: Array<Omit<FieldEvidence, 'id' | 'extractedAt'>>;
  manifest: DeliveryManifest;
}

/** 校验期失败（G11：调用方发 error 事件并以非零退出，不发 done） */
export class RssValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join('；'));
    this.name = 'RssValidationError';
  }
}

/** 取得 HTTP 响应但状态不可用（404/500 等，G5：映射 file failed 而非 queryError） */
export class FeedHttpError extends Error {
  constructor(public readonly status: number) {
    super(`HTTP ${status}`);
    this.name = 'FeedHttpError';
  }
}

export interface CollectorOptions {
  urls: string[];
  limit?: number;
  deadlineMs?: number;
  outDir: string;
  /** fetch 注入 seam（测试用）；缺省全局 fetch */
  fetchFn?: typeof fetch;
  reporter?: (ev: RssEvent) => void;
}

export function generateRssDatasetSchema(): DeliveryFieldSchema[] {
  return [
    { name: 'recordId', type: 'string', description: '条目全局唯一标识（rss_ + sha256(前像)）', nullable: false },
    { name: 'feedUrl', type: 'string', description: '来源 Feed URL', nullable: false },
    { name: 'title', type: 'string', description: '条目标题（原文缺失为 null）', nullable: true },
    { name: 'link', type: 'string', description: '条目链接（原文缺失为 null）', nullable: true },
    { name: 'published', type: 'string', description: '发布时间原文（缺失为 null，禁止估算）', nullable: true },
    { name: 'summary', type: 'string', description: '条目摘要（原文缺失为 null）', nullable: true },
    { name: 'qualityStatus', type: 'string', description: '记录质量状态: valid/missing_field', nullable: false },
    { name: 'missingReason', type: 'string', description: '核心字段缺失原因', nullable: true },
  ];
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** G3 豁免：RSS_ALLOW_PRIVATE_ORIGIN=1 仅绕过私网/回环判定，协议白名单仍生效。 */
function guardReason(url: string): string | null {
  const reason = egressBlockReason(url);
  if (reason === null) return null;
  if (
    process.env.RSS_ALLOW_PRIVATE_ORIGIN === '1' &&
    reason !== EGRESS_PROTOCOL_REASON &&
    reason !== EGRESS_PRIVATE_BLOCK_REASON
  ) {
    return reason; // 未知原因不豁免（fail-closed）
  }
  if (process.env.RSS_ALLOW_PRIVATE_ORIGIN === '1' && reason === EGRESS_PRIVATE_BLOCK_REASON) {
    return null;
  }
  return reason;
}

function recordIdFor(entry: FeedEntry, feedUrl: string, rawXml: string): string {
  let preimage: string;
  if (entry.link) {
    try {
      preimage = new URL(entry.link, feedUrl).href;
    } catch {
      preimage = entry.link;
    }
  } else if (entry.guid) {
    preimage = entry.guid;
  } else {
    preimage = rawXml.slice(entry.raw.title ? rawXml.indexOf(entry.raw.title) : 0);
  }
  return `rss_${createHash('sha256').update(preimage).digest('hex')}`;
}

function buildRecordsAndEvidences(
  feedUrl: string,
  snapshotId: string,
  taskId: string,
  rawXml: string,
  entries: FeedEntry[]
): { records: RssRecord[]; evidences: Array<Omit<FieldEvidence, 'id' | 'extractedAt'>> } {
  const records: RssRecord[] = [];
  const evidences: Array<Omit<FieldEvidence, 'id' | 'extractedAt'>> = [];
  for (const entry of entries) {
    const record: RssRecord = {
      recordId: recordIdFor(entry, feedUrl, rawXml),
      feedUrl,
      title: entry.title,
      link: entry.link,
      published: entry.published,
      summary: entry.summary,
      qualityStatus: entry.title !== null && entry.link !== null ? 'valid' : 'missing_field',
    };
    if (record.qualityStatus === 'missing_field') {
      const missing: string[] = [];
      if (entry.title === null) missing.push('title');
      if (entry.link === null) missing.push('link');
      record.missingReason = `FIELD_NOT_IN_FEED:${missing.join(',')}`;
    }
    records.push(record);

    for (const field of ['title', 'link', 'published', 'summary'] as const) {
      const raw = entry.raw[field];
      if (raw === undefined) continue; // 原文没有该字段：无证据条目，值即 null
      const loc = locateSnippet(rawXml, raw);
      evidences.push({
        taskId,
        recordId: record.recordId,
        snapshotId,
        field,
        value: entry[field],
        sourceText: rawXml,
        lineStart: loc?.lineStart ?? 0,
        lineEnd: loc?.lineEnd ?? 0,
        charOffsetStart: loc?.charOffsetStart ?? 0,
        charOffsetEnd: loc?.charOffsetEnd ?? 0,
        confidence: loc ? 1.0 : 0,
        extractorType: 'parser',
      });
    }
  }
  return { records, evidences };
}

export async function runRssCollector(opts: CollectorOptions): Promise<CollectorResult> {
  const { urls, outDir } = opts;
  const limit = opts.limit ?? 50;
  const deadlineMs = opts.deadlineMs ?? 60000;
  const fetchFn = opts.fetchFn ?? fetch;
  const emit = opts.reporter ?? (() => {});

  // 校验期：逐 URL 出口门禁（G11：失败抛 RssValidationError，不发 start/done）
  const validationErrors: string[] = [];
  for (const url of urls) {
    const reason = guardReason(url);
    if (reason) validationErrors.push(`${reason}: ${url}`);
  }
  if (validationErrors.length > 0) throw new RssValidationError(validationErrors);

  await fs.mkdir(path.join(outDir, 'snapshots'), { recursive: true });
  const storage = new SnapshotStorage(path.join(outDir, 'snapshots'));
  const evidenceStore = new EvidenceIndexStore(path.join(outDir, 'evidence.sqlite'));
  const budget = new BudgetGate({ maxCalls: urls.length }); // G6/KA3：一个 Feed 占一次配额，重定向跳数不占
  const taskId = path.basename(path.resolve(outDir));

  const controller = new AbortController();
  let deadlineHit = false;
  const deadlineTimer = setTimeout(() => {
    deadlineHit = true;
    controller.abort();
  }, deadlineMs);

  const allRecords: RssRecord[] = [];
  const allEvidences: Array<Omit<FieldEvidence, 'id' | 'extractedAt'>> = [];
  let downloaded = 0;
  let failed = 0;
  let totalBytes = 0;
  let anyTruncated = false;

  emit({ type: 'start', totalCompanies: urls.length, dryRun: false });

  for (let i = 0; i < urls.length; i++) {
    const feedUrl = urls[i];
    const host = hostOf(feedUrl);
    emit({ type: 'company', index: i + 1, total: urls.length, code: host, name: host });

    if (deadlineHit) {
      emit({ type: 'queryError', target: feedUrl, reason: DEADLINE_REASON });
      failed++;
      continue;
    }

    try {
      budget.checkAndReserve(0, 0);
      const collected = await collectOneFeed(fetchFn, feedUrl, controller.signal);
      budget.recordUsage({});

      const parsed = parseFeed(collected.text);
      if (parsed === null) {
        // A05：取得响应但不是合法 Feed → file failed（G5）
        emit({ type: 'file', status: 'failed', code: host, name: host, reason: '响应不是合法 Feed' });
        failed++;
        continue;
      }

      const entries = parsed.entries.slice(0, limit);
      const bytes = Buffer.byteLength(collected.text, 'utf8');
      if (parsed.truncated) anyTruncated = true; // G10：manifest limitations 需注明「Feed 可能截断」
      const snapshot = await storage.saveSnapshot(
        {
          targetUrl: feedUrl,
          finalUrl: collected.finalUrl,
          provider: 'rss_native_fetch',
          statusCode: collected.statusCode,
          xml: collected.text,
          responseType: collected.contentType ?? 'application/xml',
          truncated: parsed.truncated,
        },
      );
      const { records, evidences } = buildRecordsAndEvidences(feedUrl, snapshot.snapshotId, taskId, collected.text, entries);
      allRecords.push(...records);
      if (evidences.length > 0) evidenceStore.insertBatch(evidences);
      allEvidences.push(...evidences);
      downloaded++;
      totalBytes += bytes;
      emit({
        type: 'file',
        status: 'downloaded',
        code: host,
        name: parsed.feedTitle ?? host,
        title: parsed.feedTitle ?? undefined,
        path: path.join('snapshots', snapshot.snapshotId),
        bytes,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        emit({ type: 'queryError', target: feedUrl, reason: DEADLINE_REASON });
      } else if (err instanceof FeedHttpError) {
        emit({ type: 'file', status: 'failed', code: host, name: host, reason: `HTTP ${err.status}` });
      } else if (err instanceof Error && err.message === REDIRECT_LIMIT_REASON) {
        emit({ type: 'queryError', target: feedUrl, reason: REDIRECT_LIMIT_REASON });
      } else if (err instanceof Error && err.message.startsWith('EGRESS:')) {
        emit({ type: 'queryError', target: feedUrl, reason: err.message.slice('EGRESS:'.length) });
      } else {
        emit({ type: 'queryError', target: feedUrl, reason: err instanceof Error ? err.message : String(err) });
      }
      failed++;
    }
  }

  clearTimeout(deadlineTimer);
  evidenceStore.close();

  await fs.writeFile(path.join(outDir, 'records.jsonl'), allRecords.map((r) => JSON.stringify(r)).join('\n') + (allRecords.length ? '\n' : ''), 'utf8');
  await fs.writeFile(path.join(outDir, 'evidences.jsonl'), allEvidences.map((e) => JSON.stringify(e)).join('\n') + (allEvidences.length ? '\n' : ''), 'utf8');

  const filesToSign = ['records.jsonl', 'evidences.jsonl', 'evidence.sqlite'];
  const checksums: Record<string, string> = {};
  for (const file of filesToSign) {
    const full = path.join(outDir, file);
    if (existsFileSync(full)) checksums[file] = await computeFileSha256(full);
  }

  const summary: RssSummary = {
    companies: urls.length,
    matched: allRecords.length,
    downloaded,
    skipped: 0,
    bytes: totalBytes,
    failed,
    outDir,
  };

  const validCount = allRecords.filter((r) => r.qualityStatus === 'valid').length;
  const manifest: DeliveryManifest = {
    manifestVersion: '1.0.0',
    datasetId: taskId,
    datasetVersion: `v1.0-${Date.now().toString(36)}`,
    generatedAt: new Date().toISOString(),
    generator: {
      name: 'web-crawler/rss-collector',
      version: '0.1.0',
      description: '公开 RSS 只读采集 PoC：快照、字段级证据与交付清单',
    },
    sourceSummary: {
      sourceType: 'rss',
      totalUrls: urls.length,
      succeeded: downloaded,
      failed,
    },
    schema: { fields: generateRssDatasetSchema() },
    qualityMetrics: {
      totalRecords: allRecords.length,
      validRecords: validCount,
      evidenceCoverageRate: validCount > 0 ? Number((Math.min(validCount, allEvidences.length) / validCount).toFixed(4)) : 1.0,
      dataCompletenessRate: allRecords.length > 0 ? Number((validCount / allRecords.length).toFixed(4)) : 1.0,
    },
    files: {
      recordsData: 'records.jsonl',
      evidenceJsonl: 'evidences.jsonl',
      evidenceIndex: 'evidence.sqlite',
      snapshotsDir: 'snapshots/',
    },
    checksums,
    limitations: [
      '冻结样本范围的手写 RSS/Atom 解析器，未覆盖命名空间等真实世界变体',
      '不抓取条目正文与附件（需要时另立任务走 web-scraper）',
      '发布时间不做估算，原文缺失即 null',
      '跨 Feed 转载条目不去重',
      // G10：任一 Feed 传输截断时向交付声明面注明
      ...(anyTruncated ? ['部分 Feed 传输截断：已保留完整条目、丢弃未闭合尾部，详见快照 metadata.truncated'] : []),
    ],
    operations: [{ backend: 'rss_native_fetch' }],
  };
  await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  emit({ type: 'done', summary });
  return { summary, records: allRecords, evidences: allEvidences, manifest };
}

function existsFileSync(p: string): boolean {
  return existsSync(p);
}

interface FetchedFeed {
  text: string;
  finalUrl: string;
  statusCode: number;
  contentType: string | null;
}

/**
 * 拉取单个 Feed：manual 重定向逐跳守卫（每跳先守卫后请求、≤5 跳）。
 * 4xx/5xx 抛 HttpError（调用方映射 file failed，G5）。
 */
async function collectOneFeed(
  fetchFn: typeof fetch,
  feedUrl: string,
  signal: AbortSignal
): Promise<FetchedFeed> {
  let current = feedUrl;
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    if (hop > 0) {
      const reason = guardReason(current);
      if (reason) throw new Error(`EGRESS:${reason}: ${current}`);
    }
    const res = await fetchFn(current, { redirect: 'manual', signal });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new Error(`HTTP ${res.status}: 缺少重定向 Location`);
      if (hop === MAX_REDIRECT_HOPS) throw new Error(REDIRECT_LIMIT_REASON);
      current = new URL(location, current).href;
      continue;
    }
    if (!res.ok) throw new FeedHttpError(res.status);
    const text = await res.text();
    return { text, finalUrl: current, statusCode: res.status, contentType: res.headers.get('content-type') };
  }
  throw new Error(REDIRECT_LIMIT_REASON);
}
