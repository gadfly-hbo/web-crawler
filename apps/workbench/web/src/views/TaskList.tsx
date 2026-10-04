/** 任务列表（首页）：卡片清单 + 空状态引导。 */
import { STATUS_LABELS, type TaskRecord } from '../../../shared/task';
import { StatusChip } from '../components/StatusChip';

export function TaskList(props: { tasks: TaskRecord[]; onOpen: (id: string) => void; onNew: () => void }) {
  const { tasks, onOpen, onNew } = props;
  return (
    <div className="view">
      <h1 className="page-title">采集任务</h1>
      <p className="view-desc">这里列出全部采集任务。新建任务后先预览数量，确认范围无误再正式开始。</p>
      {tasks.length === 0 ? (
        <div className="empty">
          <p>还没有采集任务</p>
          <p className="small">从「新建采集任务」开始：选公司或行业 → 预览数量 → 开始采集。</p>
          <div className="next">
            <button className="btn btn-primary" onClick={onNew}>
              新建第一个采集任务
            </button>
          </div>
        </div>
      ) : (
        tasks.map((t) => (
          <div key={t.id} className="card task-card" onClick={() => onOpen(t.id)}>
            <div className="row">
              <strong>{t.title}</strong>
              <StatusChip status={t.status} />
            </div>
            {t.status === 'running' && t.totalCompanies > 0 && (
              <div className="progress">
                <i style={{ width: `${Math.round((t.companyIndex / t.totalCompanies) * 100)}%` }} />
              </div>
            )}
            <div className="counts">
              <span>下载 {t.counts.downloaded}</span>
              <span>跳过 {t.counts.skipped}</span>
              <span>失败 {t.counts.failed}</span>
              {t.preview && <span>预览：{t.preview.companies} 家公司 / {t.preview.reports} 份报告</span>}
              <span className="meta">
                {t.dryRun ? '预览任务' : '采集任务'} · {STATUS_LABELS[t.status]}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
