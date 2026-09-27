/** 任务详情：SSE 驱动的实时进度/计数/日志，含取消与失败披露。断线由 EventSource 自动重连，服务端回放+序号去重。 */
import { useEffect, useRef, useState } from 'react';

import { api } from '../api';
import { formatLogLine } from '../../../shared/log-format';
import { STATUS_LABELS, type TaskRecord } from '../../../shared/task';
import { StatusChip } from '../App';
import { FileList } from './FileList';

export function TaskDetail(props: {
  id: string;
  task: TaskRecord | undefined; // 列表态快照（SSE 建立前展示）
  showToast: (m: string) => void;
}) {
  const { id } = props;
  const [task, setTask] = useState<TaskRecord | undefined>(props.task);
  const [logs, setLogs] = useState<Array<{ seq: number; text: string }>>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTask(props.task);
    setLogs([]);
    const es = new EventSource(`/api/task/${id}/events`);
    es.addEventListener('task', (e) => setTask(JSON.parse((e as MessageEvent).data) as TaskRecord));
    es.addEventListener('log', (e) => {
      const { seq, line } = JSON.parse((e as MessageEvent).data) as { seq: number; line: string };
      setLogs((prev) => {
        if (prev.some((l) => l.seq === seq)) return prev; // 重连回放去重
        return [...prev, { seq, text: formatLogLine(line) }];
      });
    });
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (autoScroll && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs, autoScroll]);

  if (!task) {
    return (
      <div className="view">
        <div className="empty">
          <p>任务不存在或仍在加载中</p>
          <div className="next">
            <button className="btn btn-secondary" onClick={() => (window.location.hash = '#/')}>
              返回任务列表
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pct = task.totalCompanies > 0 ? Math.round((task.companyIndex / task.totalCompanies) * 100) : 0;
  const cancellable = task.status === 'queued' || task.status === 'running';

  return (
    <div className="view">
      <h1 className="view-title">{task.title}</h1>
      <p className="view-desc">
        {task.dryRun ? '预览任务（只统计数量，不下载文件）' : '采集任务'} · 创建于{' '}
        {new Date(task.createdAt).toLocaleString('zh-CN')}
      </p>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>状态：{STATUS_LABELS[task.status]}</strong>
          <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {cancellable && (
              <button
                className="btn btn-danger btn-sm"
                onClick={async () => {
                  await api.cancelTask(task.id);
                  props.showToast('已取消（已下载的文件会保留）');
                }}
              >
                取消任务（已下载的文件会保留）
              </button>
            )}
            <StatusChip status={task.status} />
          </span>
        </div>
        {task.status === 'running' && (
          <>
            <div className="progress">
              <i style={{ width: `${pct}%` }} />
            </div>
            <p className="small" style={{ marginTop: 8 }}>
              {task.totalCompanies > 0
                ? `正在处理 ${task.companyIndex}/${task.totalCompanies}：${task.currentCompany ?? ''}`
                : '正在查询公告清单…'}
            </p>
          </>
        )}
        {task.status === 'queued' && <p className="small">排队中：等待前一个任务完成。</p>}
        <div className="counts">
          <span>下载 {task.counts.downloaded}</span>
          <span>跳过 {task.counts.skipped}</span>
          <span>失败 {task.counts.failed}</span>
          <span>匹配报告 {task.counts.matched}</span>
        </div>
      </div>

      {task.preview && (
        <div className="card">
          <h3 className="card-h">预览结果</h3>
          <p>
            共匹配 <strong>{task.preview.companies}</strong> 家公司、<strong>{task.preview.reports}</strong> 份报告
          </p>
        </div>
      )}

      {task.error && <div className="fail-card">任务失败：{task.error}</div>}
      {task.status === 'canceled' && (
        <div className="warn-card">任务已取消。已下载的文件保留在输出目录中；最后一份文件可能不完整。</div>
      )}
      {task.failures.length > 0 && (
        <div className="fail-card">
          以下内容未能采集（{task.failures.length} 处）：
          <ul>
            {task.failures.map((f, i) => (
              <li key={i}>
                {f.target ? `检索「${f.target}」` : `${f.code ?? ''} ${f.name ?? ''}`}：{f.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h3 className="card-h" style={{ display: 'flex', justifyContent: 'space-between' }}>
          运行日志
          <label className="small" style={{ fontWeight: 400 }}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />{' '}
            自动滚动到底部
          </label>
        </h3>
        <div className="logbox" ref={logRef}>
          {logs.length === 0 ? '（暂无日志）' : logs.map((l) => <div key={l.seq}>{l.text}</div>)}
        </div>
      </div>

      <div className="card">
        <h3 className="card-h" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          产出文件
          {!task.dryRun && (
            <span style={{ display: 'flex', gap: 8 }}>
              <a className="btn btn-ghost btn-sm" href={api.archiveUrl(task.id)} download>
                打包下载 zip
              </a>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  void api.reveal(task.id);
                  props.showToast('已在 Finder 中显示输出目录');
                }}
              >
                在 Finder 中显示
              </button>
            </span>
          )}
        </h3>
        <FileList taskId={task.id} refreshKey={`${task.status}:${task.counts.downloaded + task.counts.skipped}`} />
      </div>

      <div className="card">
        <h3 className="card-h">输出目录</h3>
        <p className="mono small">{task.outDir}</p>
      </div>
    </div>
  );
}
