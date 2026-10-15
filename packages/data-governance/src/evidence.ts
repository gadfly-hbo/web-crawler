import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export type ExtractorType = 'css' | 'regex' | 'llm' | 'manual' | 'api' | 'parser';

export interface FieldEvidence {
  id: string;
  taskId: string;
  recordId: string;
  snapshotId: string;
  field: string;
  value: any;
  sourceText: string;
  selectorOrPattern?: string;
  lineStart: number;
  lineEnd: number;
  charOffsetStart: number;
  charOffsetEnd: number;
  confidence: number;
  extractorType: ExtractorType;
  extractedAt: string;
}

export interface TextLocation {
  lineStart: number;
  lineEnd: number;
  charOffsetStart: number;
  charOffsetEnd: number;
}

/**
 * 在文本中精确定位子串的字符偏移与 1-indexed 行号范围
 */
export function locateSnippet(
  content: string,
  snippet: string,
  fromIndex: number = 0
): TextLocation | null {
  if (!content || !snippet) return null;

  let index = content.indexOf(snippet, fromIndex);
  if (index === -1) {
    const trimmed = snippet.trim();
    if (!trimmed) return null;
    index = content.indexOf(trimmed, fromIndex);
    if (index === -1) return null;
    snippet = trimmed;
  }

  const charOffsetStart = index;
  const charOffsetEnd = index + snippet.length;

  const prefix = content.slice(0, charOffsetStart);
  const lineStart = (prefix.match(/\n/g) || []).length + 1;

  const matchedRange = content.slice(0, charOffsetEnd);
  const lineEnd = (matchedRange.match(/\n/g) || []).length + 1;

  return {
    lineStart,
    lineEnd,
    charOffsetStart,
    charOffsetEnd,
  };
}

export class EvidenceIndexStore {
  private db: DatabaseSync;

  constructor(dbPath: string = ':memory:') {
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS field_evidences (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        record_id TEXT NOT NULL,
        snapshot_id TEXT NOT NULL,
        field TEXT NOT NULL,
        value_json TEXT,
        source_text TEXT NOT NULL,
        selector_or_pattern TEXT,
        line_start INTEGER NOT NULL,
        line_end INTEGER NOT NULL,
        char_offset_start INTEGER NOT NULL,
        char_offset_end INTEGER NOT NULL,
        confidence REAL NOT NULL,
        extractor_type TEXT NOT NULL,
        extracted_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_evidences_lookup ON field_evidences(task_id, record_id, field);
      CREATE INDEX IF NOT EXISTS idx_evidences_snapshot ON field_evidences(task_id, snapshot_id);
    `);
  }

  public insert(evidence: Omit<FieldEvidence, 'id' | 'extractedAt'> & { id?: string; extractedAt?: string }): FieldEvidence {
    const full: FieldEvidence = {
      id: evidence.id || randomUUID(),
      extractedAt: evidence.extractedAt || new Date().toISOString(),
      ...evidence,
    };

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO field_evidences (
        id, task_id, record_id, snapshot_id, field, value_json,
        source_text, selector_or_pattern, line_start, line_end,
        char_offset_start, char_offset_end, confidence, extractor_type, extracted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      full.id,
      full.taskId,
      full.recordId,
      full.snapshotId,
      full.field,
      JSON.stringify(full.value),
      full.sourceText,
      full.selectorOrPattern || null,
      full.lineStart,
      full.lineEnd,
      full.charOffsetStart,
      full.charOffsetEnd,
      full.confidence,
      full.extractorType,
      full.extractedAt
    );

    return full;
  }

  public insertBatch(evidences: Array<Omit<FieldEvidence, 'id' | 'extractedAt'> & { id?: string; extractedAt?: string }>): FieldEvidence[] {
    const results: FieldEvidence[] = [];
    for (const ev of evidences) {
      results.push(this.insert(ev));
    }
    return results;
  }

  public query(options: {
    taskId: string;
    recordId?: string;
    field?: string;
    snapshotId?: string;
  }): FieldEvidence[] {
    let sql = 'SELECT * FROM field_evidences WHERE task_id = ?';
    const params: any[] = [options.taskId];

    if (options.recordId) {
      sql += ' AND record_id = ?';
      params.push(options.recordId);
    }
    if (options.field) {
      sql += ' AND field = ?';
      params.push(options.field);
    }
    if (options.snapshotId) {
      sql += ' AND snapshot_id = ?';
      params.push(options.snapshotId);
    }

    sql += ' ORDER BY line_start ASC';

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map((r) => this.mapRow(r));
  }

  public getById(id: string): FieldEvidence | null {
    const stmt = this.db.prepare('SELECT * FROM field_evidences WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    return this.mapRow(row);
  }

  public close(): void {
    this.db.close();
  }

  private mapRow(r: any): FieldEvidence {
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
      extractorType: r.extractor_type as ExtractorType,
      extractedAt: r.extracted_at,
    };
  }
}
