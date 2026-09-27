/** 应用外壳：侧栏 + 主工作区 +（详情时）Inspector + 底部状态栏；hash 路由。 */
import { useCallback, useEffect, useState } from 'react';

import { api } from './api';
import { STATUS_LABELS, STATUS_TONES, type TaskRecord } from '../../shared/task';
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

function StatusChip({ status }: { status: TaskRecord['status'] }) {
  const tone = STATUS_TONES[status];
  return (
    <span className={`chip chip-${tone}`}>
      <span className={`dot dot-${tone}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}
export { StatusChip };

export function App() {
  const hash = useHashRoute();
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [toast, setToast] = useState<string | null>(null);

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
  const activeTask = detailId ? tasks.find((t) => t.id === detailId) : undefined;

  const go = (h: string) => {
    window.location.hash = h;
  };

  const sidebarItem = (t: TaskRecord) => (
    <button
      key={t.id}
      className={`sidebar-item${detailId === t.id ? ' active' : ''}`}
      onClick={() => go(`#/tasks/${t.id}`)}
      title={t.title}
    >
      {t.title}
      <br />
      <span className="meta">
        {STATUS_LABELS[t.status]} · {new Date(t.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
      </span>
    </button>
  );

  return (
    <div className={`shell${activeTask ? ' with-inspector' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          数据采集工作台
          <small>巨潮资讯 · A 股财报</small>
        </div>
        <button className="btn btn-primary new-btn" onClick={() => go('#/new')}>
          ＋ 新建采集任务
        </button>
        <div style={{ padding: '0 14px 10px', display: 'flex', gap: 6 }}>
          <button
            className={`btn btn-sm ${hash === '#/' || hash === '' ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => go('#/')}
          >
            采集任务
          </button>
          <button className={`btn btn-sm ${hash === '#/files' ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => go('#/files')}>
            数据文件
          </button>
        </div>
        <div className="sidebar-list">
          {running.length > 0 && <div className="sidebar-group">进行中</div>}
          {running.map(sidebarItem)}
          {history.length > 0 && <div className="sidebar-group">历史</div>}
          {history.slice(0, 30).map(sidebarItem)}
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
          <h3 className="card-h">采集条件</h3>
          <p className="small">
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
          </p>
          <h3 className="card-h">边界声明</h3>
          <p className="small">数据来自巨潮资讯网公开公告，仅保存在本机 data/ 目录，不上传任何服务器。</p>
        </aside>
      )}

      <footer className="statusbar">
        <span>本机运行 · 127.0.0.1</span>
        <span>运行中 {tasks.filter((t) => t.status === 'running').length} · 排队 {tasks.filter((t) => t.status === 'queued').length}</span>
        <span>数据仅保存在本机 data/ 目录</span>
      </footer>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
