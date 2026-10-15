import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface SnapshotMetadata {
  snapshot_id: string;
  target_url: string;
  final_url?: string;
  provider?: string;
  status_code: number;
  requested_at: string;
  received_at: string;
  duration_ms: number;
  content_hash: string;
  formats: string[];
  response_type?: string;
  truncated?: boolean;
  files: {
    markdown?: string;
    html?: string;
    xml?: string;
    metadata: string;
  };
}

export class SnapshotStorage {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
  }

  public getSnapshotsDir(): string {
    return this.baseDir;
  }

  public getSnapshotPath(snapshotId: string): string {
    return path.join(this.baseDir, snapshotId);
  }

  public async saveSnapshot(
    acquisition: {
      targetUrl: string;
      finalUrl?: string;
      provider?: string;
      statusCode?: number;
      markdown?: string;
      html?: string;
      xml?: string;
      requestedAt?: string;
      receivedAt?: string;
      responseType?: string;
      truncated?: boolean;
    },
    customSnapshotId?: string
  ): Promise<{ snapshotId: string; snapshotDir: string; contentHash: string; metadata: SnapshotMetadata }> {
    const receivedAt = acquisition.receivedAt || new Date().toISOString();
    const requestedAt = acquisition.requestedAt || receivedAt;
    const durationMs = Math.max(0, new Date(receivedAt).getTime() - new Date(requestedAt).getTime());

    const snapshotId = customSnapshotId || `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const snapshotDir = path.join(this.baseDir, snapshotId);
    const tmpDir = `${snapshotDir}.tmp`;

    await fs.mkdir(tmpDir, { recursive: true });

    try {
      const files: SnapshotMetadata['files'] = {
        metadata: 'metadata.json',
      };
      const formats: string[] = [];
      let rawContentForHash = '';

      if (acquisition.markdown !== undefined) {
        await fs.writeFile(path.join(tmpDir, 'content.md'), acquisition.markdown, 'utf8');
        files.markdown = 'content.md';
        formats.push('markdown');
        rawContentForHash += acquisition.markdown;
      }

      if (acquisition.html !== undefined) {
        await fs.writeFile(path.join(tmpDir, 'content.html'), acquisition.html, 'utf8');
        files.html = 'content.html';
        formats.push('html');
        rawContentForHash += acquisition.html;
      }

      if (acquisition.xml !== undefined) {
        await fs.writeFile(path.join(tmpDir, 'content.xml'), acquisition.xml, 'utf8');
        files.xml = 'content.xml';
        formats.push('xml');
        rawContentForHash += acquisition.xml;
      }

      const contentHash = createHash('sha256').update(rawContentForHash).digest('hex');

      const metadata: SnapshotMetadata = {
        snapshot_id: snapshotId,
        target_url: acquisition.targetUrl,
        final_url: acquisition.finalUrl || acquisition.targetUrl,
        provider: acquisition.provider || 'unknown',
        status_code: acquisition.statusCode ?? 200,
        requested_at: requestedAt,
        received_at: receivedAt,
        duration_ms: durationMs,
        content_hash: contentHash,
        formats,
        response_type: acquisition.responseType,
        truncated: acquisition.truncated,
        files,
      };

      await fs.writeFile(
        path.join(tmpDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2),
        'utf8'
      );

      await fs.rename(tmpDir, snapshotDir);

      return { snapshotId, snapshotDir, contentHash, metadata };
    } catch (err) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  }

  public async readMetadata(snapshotId: string): Promise<SnapshotMetadata | null> {
    const metaPath = path.join(this.baseDir, snapshotId, 'metadata.json');
    try {
      const content = await fs.readFile(metaPath, 'utf8');
      return JSON.parse(content) as SnapshotMetadata;
    } catch {
      return null;
    }
  }
}
