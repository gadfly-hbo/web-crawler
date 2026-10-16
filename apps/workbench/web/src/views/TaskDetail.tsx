import { useEffect, useRef, useState } from 'react';

import { api } from '../api';
import { formatLogLine } from '../../../shared/log-format';
import { STATUS_LABELS, type TaskRecord } from '../../../shared/task';
import { CATEGORY_LABELS, getTaskCategory } from '../../../shared/task-params';
import { FailureList } from '../components/FailureList';
import { StatusChip } from '../components/StatusChip';
import { FileList } from './FileList';
import { ProductPriceDashboard } from './components/ProductPriceDashboard';
import { UniversalManifestCard } from './components/UniversalManifestCard';

export function TaskDetail(props: {
  id: string;
  task: TaskRecord | undefined; // 列表态快照（SSE 建立前展示）
  showToast: (m: string) => void;
}) {
  const { id } = props;
  const [task, setTask] = useState<TaskRecord | undefined>(props.task);
  const [logs, setLogs] = useState<Array<{ seq: number; text: string }>>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [starting, setStarting] = useState(false);
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
  const cat = getTaskCategory(task.params);
  const catMeta = CATEGORY_LABELS[cat];

  return (
    <div className="view">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <h1 className="view-title" style={{ margin: 0 }}>
          {task.title}
        </h1>
        <span className={`tag-badge ${catMeta.chipClass}`} style={{ fontSize: 11, padding: '2px 8px' }}>
          {catMeta.icon} {catMeta.label}
        </span>
      </div>
      <p className="view-desc">
        {task.dryRun ? '预览任务（只统计数量，不下载文件）' : '采集任务'} · 创建于{' '}
        {new Date(task.createdAt).toLocaleString('zh-CN')}
      </p>

      {/* 顶部通栏：状态、核心指标与主操作卡片 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <strong style={{ fontSize: 14 }}>状态：{STATUS_LABELS[task.status]}</strong>
            <StatusChip status={task.status} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {task.dryRun && task.status === 'succeeded' && (
              <button
                className="btn btn-primary btn-sm"
                disabled={starting}
                onClick={async () => {
                  setStarting(true);
                  try {
                    const { task: newTask, errors } = await api.createTask(task.params, false);
                    if (errors && errors.length > 0) {
                      props.showToast(`启动失败: ${errors.join('; ')}`);
                      setStarting(false);
                      return;
                    }
                    await api.deleteTask(task.id);
                    props.showToast('正式采集任务已开始');
                    window.location.hash = `#/tasks/${newTask!.id}`;
                  } catch {
                    props.showToast('启动异常，请重试');
                    setStarting(false);
                  }
                }}
              >
                🚀 正式开始采集
              </button>
            )}
            {!task.dryRun && (
              <>
                <a className="btn btn-ghost btn-sm" href={api.archiveUrl(task.id)} download>
                  打包下载 zip
                </a>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    void api.reveal(task.id);
                    props.showToast('已在 Finder 中显示输出目录');
                  }}
                >
                  在 Finder 中显示
                </button>
              </>
            )}
            {cancellable ? (
              <button
                className="btn btn-danger btn-sm"
                onClick={async () => {
                  await api.cancelTask(task.id);
                  props.showToast('已取消（已下载的文件会保留）');
                }}
              >
                取消任务
              </button>
            ) : (
              <button
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  await api.deleteTask(task.id);
                  props.showToast('已删除记录');
                  window.location.hash = '#/';
                }}
              >
                {task.dryRun ? '删除此预览' : '删除记录'}
              </button>
            )}
          </div>
        </div>

        {task.status === 'running' && (
          <>
            <div className="progress" style={{ marginTop: 12 }}>
              <i style={{ width: `${pct}%` }} />
            </div>
            <p className="small" style={{ marginTop: 8 }}>
              {task.totalCompanies > 0
                ? `正在处理 ${task.companyIndex}/${task.totalCompanies}：${task.currentCompany ?? ''}`
                : '正在查询公告清单…'}
            </p>
          </>
        )}
        {task.status === 'queued' && <p className="small" style={{ marginTop: 8 }}>排队中：等待前一个任务完成。</p>}

        <div className="counts" style={{ marginTop: 14 }}>
          <span>下载 {task.counts.downloaded}</span>
          <span>跳过 {task.counts.skipped}</span>
          <span>失败 {task.counts.failed}</span>
          <span>匹配报告 {task.counts.matched}</span>
        </div>
      </div>

      {task.preview && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="card-h">预览结果</h3>
          <p>
            共匹配 <strong>{task.preview.companies}</strong> 家公司、<strong>{task.preview.reports}</strong> 份报告
          </p>
        </div>
      )}

      {task.dryRun && task.status === 'succeeded' && (
        <div className="card" style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent-line)', marginBottom: 16 }}>
          <h3 className="card-h" style={{ color: 'var(--accent-strong)', marginBottom: 8 }}>
            ⚡ 预览已就绪，是否开始正式采集？
          </h3>
          <p className="small" style={{ marginBottom: 14 }}>
            本次预览已确认匹配 <strong>{task.preview?.reports ?? task.counts.matched}</strong> 条数据记录。点击上方或下方按钮即可以此参数执行抓取与文件落盘。
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              disabled={starting}
              onClick={async () => {
                setStarting(true);
                try {
                  const { task: newTask, errors } = await api.createTask(task.params, false);
                  if (errors && errors.length > 0) {
                    props.showToast(`启动失败: ${errors.join('; ')}`);
                    setStarting(false);
                    return;
                  }
                  await api.deleteTask(task.id);
                  props.showToast('正式采集任务已开始');
                  window.location.hash = `#/tasks/${newTask!.id}`;
                } catch {
                  props.showToast('启动异常，请重试');
                  setStarting(false);
                }
              }}
            >
              🚀 正式开始采集
            </button>
            <button
              className="btn btn-secondary"
              onClick={async () => {
                await api.deleteTask(task.id);
                props.showToast('已清理此预览记录');
                window.location.hash = '#/';
              }}
            >
              丢弃此预览
            </button>
          </div>
        </div>
      )}

      {task.error && <div className="fail-card" style={{ marginBottom: 16 }}>任务失败：{task.error}</div>}
      {task.status === 'canceled' && (
        <div className="warn-card" style={{ marginBottom: 16 }}>任务已取消。已下载的文件保留在输出目录中；最后一份文件可能不完整。</div>
      )}
      <FailureList failures={task.failures} />

      {/* 主体工作区：左侧产出文件与目录 + 右侧实时运行日志 */}
      <div className="detail-grid">
        <div className="detail-main">
          {cat === 'product-price' && task.status === 'succeeded' && (
            <ProductPriceDashboard taskId={task.id} />
          )}
          {/* UI 增量 S5（已批准补记 A0）：succeeded 全类目渲染 manifest 卡——对非 product 类目严格等价（G6） */}
          {task.status === 'succeeded' && (
            <UniversalManifestCard taskId={task.id} />
          )}

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 className="card-h" style={{ margin: 0 }}>
                📁 产出文件
              </h3>
              {!task.dryRun && (
                <span style={{ display: 'flex', gap: 6 }}>
                  <a className="btn btn-ghost btn-sm" href={api.archiveUrl(task.id)} download title="一键打包下载全部文件">
                    打包 zip
                  </a>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      void api.reveal(task.id);
                      props.showToast('已在 Finder 中显示输出目录');
                    }}
                    title="在 macOS 访达中查看输出文件"
                  >
                    Finder 打开
                  </button>
                </span>
              )}
            </div>
            {task.dryRun ? (
              <div className="empty" style={{ padding: '24px 16px' }}>
                <p>预览模式不下载文件</p>
                <p className="small">确认匹配数量无误后，点击上方「🚀 正式开始采集」即可落盘文件。</p>
              </div>
            ) : (
              <FileList taskId={task.id} refreshKey={`${task.status}:${task.counts.downloaded + task.counts.skipped}`} />
            )}
          </div>

          <div className="card">
            <h3 className="card-h" style={{ marginBottom: 8 }}>📂 本机输出目录</h3>
            <p className="mono small" style={{ wordBreak: 'break-all', marginBottom: 12 }}>
              {task.outDir}
            </p>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>数据安全声明</span>
              <p className="small" style={{ margin: '4px 0 0', color: 'var(--text-3)' }}>
                数据仅保存在本机上述目录中，不出本机，不上传任何外部服务器。
              </p>
            </div>
          </div>
        </div>

        <div className="detail-side">
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 className="card-h" style={{ margin: 0 }}>
                📟 运行日志 {logs.length > 0 && <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-3)' }}>({logs.length} 行)</span>}
              </h3>
              <label className="small" style={{ fontWeight: 400, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                />{' '}
                自动滚动
              </label>
            </div>
            <div className="logbox" ref={logRef}>
              {logs.length === 0 ? '（等待日志输出…）' : logs.map((l) => <div key={l.seq}>{l.text}</div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
