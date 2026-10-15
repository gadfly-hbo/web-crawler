/** 文件清单组件：详情页与数据文件视图共用。 */
import { useEffect, useState } from 'react';

import { api } from '../api';

export interface FileEntry {
  path: string;
  size: number;
  mtime: number;
}

function fmtSize(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;
}

export function FileList({ taskId, refreshKey }: { taskId: string; refreshKey?: unknown }) {
  const [files, setFiles] = useState<FileEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    void api.files(taskId).then((f) => {
      if (alive) setFiles(f);
    });
    return () => {
      alive = false;
    };
  }, [taskId, refreshKey]);

  const validFiles = files ? files.filter((f) => !f.path.endsWith('.DS_Store') && !f.path.endsWith('Thumbs.db')) : null;

  if (validFiles === null) return <p className="small">读取文件清单…</p>;
  if (validFiles.length === 0) {
    return (
      <div className="empty" style={{ padding: '24px 16px' }}>
        <p>还没有产出文件</p>
        <p className="small">采集任务成功下载后，文件会出现在这里。</p>
      </div>
    );
  }
  return (
    <div className="filelist">
      {validFiles.map((f) => {
        const isPdf = f.path.toLowerCase().endsWith('.pdf');
        const isJson = f.path.toLowerCase().endsWith('.json') || f.path.toLowerCase().endsWith('.jsonl');
        const icon = isPdf ? '📕' : isJson ? '📊' : '📄';
        return (
          <div className="file" key={f.path}>
            <span style={{ fontSize: 15 }}>{icon}</span>
            <span className="name" title={f.path} style={{ fontWeight: 500 }}>
              {f.path}
            </span>
            <span className="chip chip-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmtSize(f.size)}
            </span>
            <span className="ops">
              <a className="btn btn-ghost btn-sm" href={api.fileUrl(taskId, f.path)} download>
                下载
              </a>
            </span>
          </div>
        );
      })}
    </div>
  );
}
