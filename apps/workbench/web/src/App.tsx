/** 应用外壳：侧栏 + 主工作区 +（详情时）Inspector + 底部状态栏；hash 路由。 */
import { useCallback, useEffect, useState } from 'react';

import { api } from './api';
import logoUrl from './assets/logo.png';
import { STATUS_LABELS, type TaskRecord } from '../../shared/task';
import {
  CATEGORY_LABELS,
  getTaskCategory,
  type TaskCategory,
} from '../../shared/task-params';
import { StatusChip } from './components/StatusChip';
import { SettingsModal } from './components/SettingsModal';
import { FilesView } from './views/FilesView';
import { NewTask } from './views/NewTask';
import { TaskDetail } from './views/TaskDetail';
import { TaskList } from './views/TaskList';

function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

function getTimeBucket(createdAt: string): 'today' | 'yesterday' | 'pastWeek' | 'older' {
  const d = new Date(createdAt);
  const now = new Date();
  const dateMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.round((nowMidnight - dateMidnight) / (24 * 3600 * 1000));

  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays <= 7) return 'pastWeek';
  return 'older';
}

function formatTaskTime(createdAt: string): string {
  const bucket = getTimeBucket(createdAt);
  const d = new Date(createdAt);
  const timeStr = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (bucket === 'today') {
    return timeStr;
  }
  if (bucket === 'yesterday') {
    return `昨天 ${timeStr}`;
  }
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function App() {
  const hash = useHashRoute();
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('wb_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('wb_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const [inspectorCollapsed, setInspectorCollapsed] = useState(() => {
    try {
      return localStorage.getItem('wb_inspector_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleInspector = () => {
    setInspectorCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('wb_inspector_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const refresh = useCallback(async () => {
    try {
      setTasks(await api.tasks());
    } catch {
      // 服务未就绪时静默，下轮再试
    }
  }, []);

  // 初始快照 + SSE 列表级推送；SSE 异常时降级为 2s 轮询
  useEffect(() => {
    void refresh();
    let poll: ReturnType<typeof setInterval> | null = null;
    const startPoll = () => {
      if (!poll) poll = setInterval(() => void refresh(), 2000);
    };
    const es = new EventSource('/api/events');
    es.addEventListener('task', (e) => {
      const t = JSON.parse((e as MessageEvent).data) as TaskRecord;
      setTasks((prev) => {
        const idx = prev.findIndex((x) => x.id === t.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = t;
          return next;
        }
        return [t, ...prev];
      });
    });
    es.addEventListener('delete', (e) => {
      const deletedId = (e as MessageEvent).data;
      setTasks((prev) => prev.filter((x) => x.id !== deletedId));
    });
    es.onerror = () => {
      es.close();
      startPoll();
    };
    return () => {
      es.close();
      if (poll) clearInterval(poll);
    };
  }, [refresh]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const detailId = hash.startsWith('#/tasks/') ? hash.slice('#/tasks/'.length) : null;
  const running = tasks.filter((t) => t.status === 'running' || t.status === 'queued');
  const history = tasks.filter((t) => t.status !== 'running' && t.status !== 'queued');
  const formalHistory = history.filter((t) => !t.dryRun);
  const previewHistory = history.filter((t) => t.dryRun);

  const todayTasks = formalHistory.filter((t) => getTimeBucket(t.createdAt) === 'today');
  const yesterdayTasks = formalHistory.filter((t) => getTimeBucket(t.createdAt) === 'yesterday');
  const pastWeekTasks = formalHistory.filter((t) => getTimeBucket(t.createdAt) === 'pastWeek');
  const olderTasks = formalHistory.filter((t) => getTimeBucket(t.createdAt) === 'older');

  const activeTask = detailId ? tasks.find((t) => t.id === detailId) : undefined;

  const go = (h: string) => {
    window.location.hash = h;
  };

  const sidebarItem = (t: TaskRecord) => {
    const cat = getTaskCategory(t.params);
    const catMeta = CATEGORY_LABELS[cat];
    return (
      <button
        key={t.id}
        className={`sidebar-item${detailId === t.id ? ' active' : ''}`}
        onClick={() => go(`#/tasks/${t.id}`)}
        title={t.title}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span className={`tag-badge ${catMeta.chipClass}`} style={{ margin: 0 }}>
            {catMeta.icon} {catMeta.label}
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontWeight: 500 }}>
            {t.title}
          </span>
        </div>
        <span className="meta">
          {t.dryRun ? '预览 · ' : ''}{STATUS_LABELS[t.status]} · {formatTaskTime(t.createdAt)}
        </span>
      </button>
    );
  };

  const onTasksView = hash === '#/' || hash === '' || hash.startsWith('#/tasks') || hash === '#/new';
  const onFilesView = hash === '#/files';

  return (
    <div
      className={`shell${activeTask ? ' with-inspector' : ''}${sidebarCollapsed ? ' sidebar-collapsed' : ''}${inspectorCollapsed ? ' inspector-collapsed' : ''}`}
    >
      <header className="topbar">
        <div className="topbar-brand">
          <button
            type="button"
            className="sidebar-toggle-btn"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? '展开侧栏 (快捷查看任务)' : '收起侧栏 (扩大工作区)'}
            aria-label="切换侧栏"
          >
            {sidebarCollapsed ? '⇥ 展开侧栏' : '⇤ 收起侧栏'}
          </button>
          <span className="logo-crop">
            <img src={logoUrl} alt="JuanerAI" />
          </span>
          <span className="brand-text">
            <span className="name">JuanerAI</span>
            <br />
            <span className="slogan">持续做出更好的决策</span>
          </span>
          <span className="topbar-sep" />
          <span className="topbar-product">数据采集工作台</span>
        </div>
        <nav className="topbar-switch switch" aria-label="视图切换">
          <button className={onTasksView ? 'active' : ''} onClick={() => go('#/')}>
            采集任务
          </button>
          <button className={onFilesView ? 'active' : ''} onClick={() => go('#/files')}>
            数据文件
          </button>
        </nav>
        <div className="topbar-actions">
          {activeTask && (
            <button
              type="button"
              className="sidebar-toggle-btn"
              onClick={toggleInspector}
              title={inspectorCollapsed ? '展开右侧参数栏' : '收起右侧参数栏 (放大中间工作区)'}
              aria-label="切换参数栏"
            >
              {inspectorCollapsed ? '◧ 展开参数栏' : '◨ 收起参数栏'}
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setSettingsOpen(true)}
            title="配置 Firecrawl 密钥与服务端点"
            style={{ fontSize: 12, padding: '4px 9px' }}
          >
            ⚙️ 引擎配置
          </button>
          <span className="chip chip-accent">
            <span className="dot dot-ok" />
            本机运行 · 数据不出本机
          </span>
        </div>
      </header>

      <aside className="sidebar">
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px 10px', gap: 8 }}>
          <button
            className="btn btn-primary new-btn"
            style={{ margin: 0, flex: 1, padding: '7px 12px' }}
            onClick={() => go('#/new')}
          >
            ＋ 新建采集任务
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={toggleSidebar}
            title="收起侧栏"
            style={{ padding: '6px 8px', fontSize: 13 }}
          >
            ⇤
          </button>
        </div>

        <div className="sidebar-list">
          {running.length > 0 && (
            <>
              <div className="sidebar-group">⚡ 进行中 ({running.length})</div>
              {running.map(sidebarItem)}
            </>
          )}

          {todayTasks.length > 0 && (
            <>
              <div className="sidebar-group">今天 ({todayTasks.length})</div>
              {todayTasks.map(sidebarItem)}
            </>
          )}

          {yesterdayTasks.length > 0 && (
            <>
              <div className="sidebar-group">昨天 ({yesterdayTasks.length})</div>
              {yesterdayTasks.map(sidebarItem)}
            </>
          )}

          {pastWeekTasks.length > 0 && (
            <>
              <div className="sidebar-group">近 7 天 ({pastWeekTasks.length})</div>
              {pastWeekTasks.map(sidebarItem)}
            </>
          )}

          {olderTasks.length > 0 && (
            <>
              <div className="sidebar-group">更早以前 ({olderTasks.length})</div>
              {olderTasks.map(sidebarItem)}
            </>
          )}

          {previewHistory.length > 0 && (
            <>
              <div
                className="sidebar-group"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: formalHistory.length > 0 ? 12 : 0,
                }}
              >
                <span>待确认预览 ({previewHistory.length})</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 11, padding: '1px 6px', border: 'none', color: 'var(--text-3)' }}
                  onClick={async (e) => {
                    e.stopPropagation();
                    const res = await api.clearPreviews();
                    showToast(`已清理 ${res.count} 条临时预览`);
                    void refresh();
                  }}
                  title="一键清空所有临时预览记录"
                >
                  清空
                </button>
              </div>
              {previewHistory.slice(0, 10).map(sidebarItem)}
            </>
          )}

          {tasks.length === 0 && (
            <div className="sidebar-empty">
              <p className="sidebar-empty-title">暂无任务</p>
              <p className="sidebar-empty-hint">点击上方新建首个采集任务</p>
            </div>
          )}
        </div>
        <div className="sidebar-foot">本机运行 · 数据仅保存在本机 data/ 目录，不上传</div>
      </aside>

      <main className="main">
        {hash === '#/new' ? (
          <NewTask
            onCreated={(id) => {
              void refresh();
              go(`#/tasks/${id}`);
            }}
            showToast={showToast}
          />
        ) : detailId ? (
          <TaskDetail id={detailId} task={activeTask} showToast={showToast} />
        ) : hash === '#/files' ? (
          <FilesView tasks={tasks} onOpen={(id) => go(`#/tasks/${id}`)} showToast={showToast} />
        ) : (
          <TaskList tasks={tasks} onOpen={(id) => go(`#/tasks/${id}`)} onNew={() => go('#/new')} />
        )}
      </main>

      {activeTask && (
        <aside className="inspector">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
              任务属性
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={toggleInspector}
              title="收起右侧参数栏"
              style={{ padding: '2px 7px', fontSize: 11.5 }}
            >
              ◨ 收起
            </button>
          </div>
          <h3 className="card-h">采集条件</h3>
          <p className="small">
            {activeTask.params.sourceType === 'web-scraper' ? (
              <>
                目标页面：共 {activeTask.params.urls.length} 个商品 URL<br />
                对比基准：{activeTask.params.baselineBrand || 'Brand A'}<br />
                采集模式：{activeTask.params.mock ? '离线 Mock 适配器' : 'Firecrawl 云端采集'}<br />
                分析策略：自动规则提取与标价中位数对比
              </>
            ) : activeTask.params.sourceType === 'api-connector' ? (
              <>
                接口：{activeTask.params.request.method} {activeTask.params.request.url}<br />
                分页：第 {activeTask.params.pagination.startPage} 页起，最多 {activeTask.params.pagination.maxPages} 页<br />
                列表路径：{activeTask.params.extraction.listPath}<br />
                请求间隔：{activeTask.params.sleepMs}ms
              </>
            ) : (
              <>
                {activeTask.params.companies.length > 0 && <>公司：{activeTask.params.companies.join('、')}<br /></>}
                {activeTask.params.industries.length > 0 && <>行业：{activeTask.params.industries.join('、')}<br /></>}
                时间：
                {activeTask.params.year != null
                  ? `报告期 ${activeTask.params.year} 年`
                  : `公告日 ${activeTask.params.from} ~ ${activeTask.params.to}`}
                <br />
                请求间隔：{activeTask.params.sleepMs}ms
                {activeTask.params.limit != null && (
                  <>
                    <br />
                    最多公司数：{activeTask.params.limit}
                  </>
                )}
              </>
            )}
          </p>
          <h3 className="card-h">边界声明</h3>
          <p className="small">
            {activeTask.params.sourceType === 'web-scraper'
              ? '公开网页快照与分析数据集仅保存在本机，不包含任何私有明细，结果不可变存盘。'
              : activeTask.params.sourceType === 'api-connector'
              ? '数据来自自定义 API 接口，仅保存在本机 data/ 目录，不上传任何服务器。'
              : '数据来自巨潮资讯网公开公告，仅保存在本机 data/ 目录，不上传任何服务器。'}
          </p>
        </aside>
      )}

      <footer className="statusbar">
        <span>本机运行 · 127.0.0.1</span>
        <span>{activeTask ? `当前：${activeTask.title}` : onFilesView ? '视图：数据文件' : '视图：采集任务'}</span>
        <span>运行中 {tasks.filter((t) => t.status === 'running').length} · 排队 {tasks.filter((t) => t.status === 'queued').length}</span>
        <span>数据仅保存在本机 data/ 目录</span>
      </footer>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        showToast={showToast}
      />

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
