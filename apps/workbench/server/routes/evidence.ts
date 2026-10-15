import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { Hono } from 'hono';
import type { AppDeps } from '../types.js';

export interface ManualRevision {
  id: string;
  taskId: string;
  recordId: string;
  field: string;
  oldValue: any;
  newValue: any;
  reason: string;
  author: string;
  revisedAt: string;
}

export function evidenceRoutes(deps: AppDeps): Hono {
  const app = new Hono();

  /**
   * GET /tasks/:id/evidence
   * 查询指定任务的字段级证据
   */
  app.get('/tasks/:id/evidence', async (c) => {
    const taskId = c.req.param('id');
    const task = deps.queue.get(taskId);
    if (!task) return c.json({ error: '任务不存在' }, 404);

    const recordId = c.req.query('recordId');
    const field = c.req.query('field');
    const snapshotId = c.req.query('snapshotId');

    const outDir = task.outDir;
    const sqlitePath = path.join(outDir, 'evidence.sqlite');
    const jsonlPath = path.join(outDir, 'evidences.jsonl');

    // 优先从 SQLite 查
    if (existsSync(sqlitePath)) {
      try {
        const db = new DatabaseSync(sqlitePath);
        let sql = 'SELECT * FROM field_evidences WHERE task_id = ?';
        const params: any[] = [taskId];

        if (recordId) {
          sql += ' AND record_id = ?';
          params.push(recordId);
        }
        if (field) {
          sql += ' AND field = ?';
          params.push(field);
        }
        if (snapshotId) {
          sql += ' AND snapshot_id = ?';
          params.push(snapshotId);
        }
        sql += ' ORDER BY line_start ASC';

        const stmt = db.prepare(sql);
        const rows = stmt.all(...params) as any[];
        db.close();

        const evidences = rows.map((r) => {
          let value = r.value_json;
          try {
            value = JSON.parse(r.value_json);
          } catch {
            // fallback
          }
          return {
            id: r.id,
            taskId: r.task_id,
            recordId: r.record_id,
            snapshotId: r.snapshot_id,
            field: r.field,
            value,
            sourceText: r.source_text,
            selectorOrPattern: r.selector_or_pattern || undefined,
            lineStart: Number(r.line_start),
            lineEnd: Number(r.line_end),
            charOffsetStart: Number(r.char_offset_start),
            charOffsetEnd: Number(r.char_offset_end),
            confidence: Number(r.confidence),
            extractorType: r.extractor_type,
            extractedAt: r.extracted_at,
          };
        });

        return c.json({ evidences });
      } catch (err) {
        console.warn('[EvidenceAPI] SQLite 查询失败，降级至 JSONL:', err);
      }
    }

    // 降级从 evidences.jsonl 查
    if (existsSync(jsonlPath)) {
      try {
        const content = await fs.readFile(jsonlPath, 'utf8');
        const lines = content.split('\n').filter(Boolean);
        let evidences = lines.map((l) => JSON.parse(l));

        if (recordId) evidences = evidences.filter((e) => e.recordId === recordId);
        if (field) evidences = evidences.filter((e) => e.field === field);
        if (snapshotId) evidences = evidences.filter((e) => e.snapshotId === snapshotId);

        return c.json({ evidences });
      } catch (err) {
        console.warn('[EvidenceAPI] 读取 evidences.jsonl 失败:', err);
      }
    }

    return c.json({ evidences: [] });
  });

  /**
   * GET /tasks/:id/snapshot-content
   * 读取快照原文内容
   */
  app.get('/tasks/:id/snapshot-content', async (c) => {
    const taskId = c.req.param('id');
    const task = deps.queue.get(taskId);
    if (!task) return c.json({ error: '任务不存在' }, 404);

    const snapshotId = c.req.query('snapshotId');
    if (!snapshotId) return c.json({ error: '缺少 snapshotId 参数' }, 400);

    const preferFormat = c.req.query('format') || 'markdown';
    const snapshotDir = path.join(task.outDir, 'snapshots', snapshotId);

    if (!existsSync(snapshotDir)) {
      return c.json({ error: `快照目录未找到: ${snapshotId}` }, 404);
    }

    const mdPath = path.join(snapshotDir, 'content.md');
    const htmlPath = path.join(snapshotDir, 'content.html');
    const xmlPath = path.join(snapshotDir, 'content.xml');

    let content = '';
    let format = preferFormat;

    if (preferFormat === 'xml' && existsSync(xmlPath)) {
      content = await fs.readFile(xmlPath, 'utf8');
      format = 'xml';
    } else if (preferFormat === 'markdown' && existsSync(mdPath)) {
      content = await fs.readFile(mdPath, 'utf8');
      format = 'markdown';
    } else if (existsSync(htmlPath)) {
      content = await fs.readFile(htmlPath, 'utf8');
      format = 'html';
    } else if (existsSync(mdPath)) {
      content = await fs.readFile(mdPath, 'utf8');
      format = 'markdown';
    } else if (existsSync(xmlPath)) {
      // md/html 均不存在时回退 xml（RSS 快照形态）
      content = await fs.readFile(xmlPath, 'utf8');
      format = 'xml';
    } else {
      return c.json({ error: '快照内容文件不存在' }, 404);
    }

    const lines = content.split('\n');

    return c.json({
      snapshotId,
      format,
      totalLines: lines.length,
      content,
      lines,
    });
  });

  /**
   * POST /tasks/:id/revisions
   * 人工修订留痕
   */
  app.post('/tasks/:id/revisions', async (c) => {
    const taskId = c.req.param('id');
    const task = deps.queue.get(taskId);
    if (!task) return c.json({ error: '任务不存在' }, 404);

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '无效的 JSON 请求体' }, 400);
    }

    const { recordId, field, oldValue, newValue, reason, author } = body;
    if (!recordId || !field || reason === undefined || !author) {
      return c.json({ error: '缺少必要字段: recordId, field, reason, author' }, 400);
    }

    if (typeof reason !== 'string' || reason.trim().length < 2) {
      return c.json({ error: '必须填写有效的修订理由（至少2个字符）' }, 400);
    }

    const revision: ManualRevision = {
      id: `rev_${randomUUID()}`,
      taskId,
      recordId,
      field,
      oldValue,
      newValue,
      reason: reason.trim(),
      author: String(author).trim(),
      revisedAt: new Date().toISOString(),
    };

    const revisionsPath = path.join(task.outDir, 'revisions.jsonl');
    await fs.appendFile(revisionsPath, `${JSON.stringify(revision)}\n`, 'utf8');

    return c.json({ ok: true, revision });
  });

  /**
   * GET /tasks/:id/revisions
   * 获取任务的人工修订记录列表
   */
  app.get('/tasks/:id/revisions', async (c) => {
    const taskId = c.req.param('id');
    const task = deps.queue.get(taskId);
    if (!task) return c.json({ error: '任务不存在' }, 404);

    const revisionsPath = path.join(task.outDir, 'revisions.jsonl');
    if (!existsSync(revisionsPath)) {
      return c.json({ revisions: [] });
    }

    try {
      const content = await fs.readFile(revisionsPath, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      const revisions: ManualRevision[] = lines.map((l) => JSON.parse(l));
      return c.json({ revisions });
    } catch {
      return c.json({ revisions: [] });
    }
  });

  /**
   * GET /tasks/:id/manifest
   * 获取任务标准化交付清单
   */
  app.get('/tasks/:id/manifest', async (c) => {
    const taskId = c.req.param('id');
    const task = deps.queue.get(taskId);
    if (!task) return c.json({ error: '任务不存在' }, 404);

    const manifestPath = path.join(task.outDir, 'manifest.json');
    if (!existsSync(manifestPath)) {
      return c.json({ error: '交付清单尚未生成或未执行标准化交付' }, 404);
    }

    try {
      const content = await fs.readFile(manifestPath, 'utf8');
      return c.json(JSON.parse(content));
    } catch (err: any) {
      return c.json({ error: `读取 manifest.json 失败: ${err.message}` }, 500);
    }
  });

  /**
   * GET /tasks/:id/delivery-package
   * 流式下载标准化 ZIP 交付包
   */
  app.get('/tasks/:id/delivery-package', async (c) => {
    const taskId = c.req.param('id');
    const task = deps.queue.get(taskId);
    if (!task) return c.json({ error: '任务不存在' }, 404);

    if (!existsSync(task.outDir)) {
      return c.json({ error: '该任务没有产出目录' }, 404);
    }

    // 调用系统 zip 工具流式打包输出
    const child = spawn('zip', ['-r', '-q', '-', '.'], { cwd: task.outDir });
    const onAbort = () => {
      if (!child.killed) child.kill();
    };
    c.req.raw.signal.addEventListener('abort', onAbort, { once: true });
    child.once('close', () => {
      c.req.raw.signal.removeEventListener('abort', onAbort);
    });

    const webStream = Readable.toWeb(child.stdout) as ReadableStream;
    return c.body(webStream, 200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="delivery-${taskId}.zip"`,
    });
  });

  return app;
}
