/** 数据文件视图：按任务浏览产出文件（zip 打包 / Finder 显示 / 进详情看清单）。 */
import type { TaskRecord } from '../../../shared/task';
import { StatusChip } from '../App';
import { api } from '../api';

export function FilesView(props: { tasks: TaskRecord[]; onOpen: (id: string) => void; showToast: (m: string) => void }) {
  const collectTasks = props.tasks.filter((t) => !t.dryRun);
  return (
    <div className="view">
      <h1 className="page-title">数据文件</h1>
      <p className="view-desc">按采集任务浏览下载到的财报文件。文件保存在本机 data/ 目录，可打包下载或在 Finder 中管理。</p>
      {collectTasks.length === 0 ? (
        <div className="empty">
          <p>还没有采集任务</p>
          <p className="small">先在「采集任务」页新建一个任务。</p>
        </div>
      ) : (
        collectTasks.map((t) => (
          <div key={t.id} className="card">
            <div className="row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ cursor: 'pointer' }} onClick={() => props.onOpen(t.id)}>
                {t.title}
              </strong>
              <StatusChip status={t.status} />
            </div>
            <div className="counts">
              <span>下载 {t.counts.downloaded}</span>
              <span>跳过 {t.counts.skipped}</span>
              <span>失败 {t.counts.failed}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => props.onOpen(t.id)}>
                查看文件
              </button>
              <a className="btn btn-ghost btn-sm" href={api.archiveUrl(t.id)} download>
                打包下载 zip
              </a>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  void api.reveal(t.id);
                  props.showToast('已在 Finder 中显示输出目录');
                }}
              >
                在 Finder 中显示
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
