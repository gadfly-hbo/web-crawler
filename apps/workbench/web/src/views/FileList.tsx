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

  if (files === null) return <p className="small">读取文件清单…</p>;
  if (files.length === 0) {
    return (
      <div className="empty">
        <p>还没有产出文件</p>
        <p className="small">采集任务成功下载后，文件会出现在这里。</p>
      </div>
    );
  }
  return (
    <div className="filelist">
      {files.map((f) => (
        <div className="file" key={f.path}>
          <span>📄</span>
          <span className="name" title={f.path}>
            {f.path}
          </span>
          <span className="chip chip-muted">{fmtSize(f.size)}</span>
          <span className="ops">
            <a className="btn btn-ghost btn-sm" href={api.fileUrl(taskId, f.path)} download>
              下载
            </a>
          </span>
        </div>
      ))}
    </div>
  );
}
