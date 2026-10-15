import { useState, type ReactNode } from 'react';

import { STATUS_LABELS, type TaskRecord } from '../../../shared/task';
import {
  CATEGORY_LABELS,
  getTaskCategory,
  type TaskCategory,
} from '../../../shared/task-params';
import { StatusChip } from '../components/StatusChip';

export function TaskList(props: {
  tasks: TaskRecord[];
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const { tasks, onOpen, onNew } = props;
  const [filter, setFilter] = useState<'all' | TaskCategory>('all');

  const formalTasks = tasks.filter((t) => !t.dryRun);
  const previewTasks = tasks.filter((t) => t.dryRun);

  const cninfoTasks = formalTasks.filter((t) => getTaskCategory(t.params) === 'cninfo');
  const weatherTasks = formalTasks.filter((t) => getTaskCategory(t.params) === 'weather');
  const apiTasks = formalTasks.filter((t) => getTaskCategory(t.params) === 'api');

  const filteredTasks = filter === 'all'
    ? formalTasks
    : formalTasks.filter((t) => getTaskCategory(t.params) === filter);

  const renderCard = (t: TaskRecord) => {
    const cat = getTaskCategory(t.params);
    const catMeta = CATEGORY_LABELS[cat];
    return (
      <div key={t.id} className="card task-card" onClick={() => onOpen(t.id)}>
        <div className="row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`tag-badge ${catMeta.chipClass}`} style={{ fontSize: 11, padding: '2px 8px' }}>
              {catMeta.icon} {catMeta.label}
            </span>
            <strong>{t.title}</strong>
          </div>
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
            {t.dryRun ? '预览任务（待确认）' : '采集任务'} · {STATUS_LABELS[t.status]}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="view">
      <h1 className="page-title">采集任务</h1>
      <p className="view-desc">按业务场景分层管理采集任务。新建任务后先预览数量，确认范围无误再正式开始。</p>

      {tasks.length > 0 && (
        <div className="tasklist-tabs">
          <button
            type="button"
            className={`tasklist-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            全部 ({tasks.length})
          </button>
          <button
            type="button"
            className={`tasklist-tab ${filter === 'cninfo' ? 'active' : ''}`}
            onClick={() => setFilter('cninfo')}
          >
            🏢 上市公司财报 ({cninfoTasks.length})
          </button>
          <button
            type="button"
            className={`tasklist-tab ${filter === 'weather' ? 'active' : ''}`}
            onClick={() => setFilter('weather')}
          >
            🌤️ 城市气象数据 ({weatherTasks.length})
          </button>
          {apiTasks.length > 0 && (
            <button
              type="button"
              className={`tasklist-tab ${filter === 'api' ? 'active' : ''}`}
              onClick={() => setFilter('api')}
            >
              🔌 通用 API ({apiTasks.length})
            </button>
          )}
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="empty">
          <p>还没有采集任务</p>
          <p className="small">从「新建采集任务」开始：挑选业务场景 → 预览数量 → 开始采集。</p>
          <div className="next">
            <button className="btn btn-primary" onClick={onNew}>
              新建第一个采集任务
            </button>
          </div>
        </div>
      ) : filter !== 'all' ? (
        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            {CATEGORY_LABELS[filter].icon} {CATEGORY_LABELS[filter].label} 历史任务 ({filteredTasks.length})
          </div>
          {filteredTasks.length === 0 ? (
            <p className="small" style={{ color: 'var(--text-3)', padding: 12 }}>
              该场景下暂无已完成的采集任务
            </p>
          ) : (
            filteredTasks.map(renderCard)
          )}
        </div>
      ) : (
        <>
          {previewTasks.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div className="eyebrow" style={{ color: 'var(--accent-strong)', marginBottom: 12 }}>
                ⏳ 待确认的临时预览（{previewTasks.length} 条，点击卡片可直接启动正式采集）
              </div>
              {previewTasks.map(renderCard)}
            </div>
          )}

          {renderSection('🏢 上市公司财报', cninfoTasks, renderCard)}
          {renderSection('🌤️ 城市气象数据', weatherTasks, renderCard)}
          {renderSection('🔌 通用 API 接口', apiTasks, renderCard)}
        </>
      )}
    </div>
  );
}

function renderSection(
  title: string,
  items: TaskRecord[],
  renderCard: (t: TaskRecord) => ReactNode,
) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 28 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        {title} ({items.length})
      </div>
      {items.map(renderCard)}
    </div>
  );
}
