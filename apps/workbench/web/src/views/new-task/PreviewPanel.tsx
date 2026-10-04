import type { TaskRecord } from '../../../../shared/task';
import { FailureList } from '../../components/FailureList';

export function PreviewPanel(props: {
  previewTask: TaskRecord | null;
  sleepMs: number;
  onStartCollect: () => void;
  onBackToEdit: () => void;
}) {
  const { previewTask, sleepMs, onStartCollect, onBackToEdit } = props;
  const previewDone =
    previewTask && previewTask.status !== 'running' && previewTask.status !== 'queued';
  const estimateMin = previewTask?.preview
    ? Math.max(1, Math.round((previewTask.preview.reports * sleepMs) / 60000))
    : null;

  return (
    <div className="card">
      <h3 className="card-h">预览结果</h3>
      {!previewDone && (
        <p className="small">
          正在查询巨潮资讯网…（{previewTask?.status === 'queued' ? '排队中' : '查询中'}）
        </p>
      )}
      {previewDone && previewTask?.status === 'succeeded' && previewTask.preview && (
        <>
          <p>
            共匹配 <strong>{previewTask.preview.companies}</strong> 家公司、
            <strong>{previewTask.preview.reports}</strong> 份报告
          </p>
          {estimateMin != null && (
            <p className="small">
              预计最短约 {estimateMin} 分钟（按报告数 × 请求间隔估算的下限，实际取决于文件大小与网络）。
            </p>
          )}
          {estimateMin != null && estimateMin >= 5 && (
            <div className="warn-card">任务量较大：期间其他任务会排队，请确认范围无误。</div>
          )}
          <div className="fld-row" style={{ marginTop: 14 }}>
            <button className="btn btn-primary" onClick={onStartCollect}>
              确认无误，开始采集
            </button>
            <button className="btn btn-secondary" onClick={onBackToEdit}>
              返回修改
            </button>
          </div>
        </>
      )}
      {previewDone && previewTask?.status === 'partial' && (
        <div className="warn-card">
          <FailureList
            failures={previewTask.failures}
            title="预览结果不完整（部分内容查询失败）："
            className=""
          />
          {previewTask.preview && (
            <p>
              已匹配 {previewTask.preview.companies} 家公司、
              {previewTask.preview.reports} 份报告（不含失败部分）。
            </p>
          )}
          <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" onClick={onBackToEdit}>
              返回修改
            </button>
            <button className="btn btn-primary" onClick={onStartCollect}>
              仍要采集（跳过失败部分）
            </button>
          </div>
        </div>
      )}
      {previewDone &&
        previewTask?.status !== 'succeeded' &&
        previewTask?.status !== 'partial' && (
          <div className="fail-card">
            {previewTask?.status === 'canceled'
              ? '预览任务已被取消。'
              : `预览失败：${previewTask?.error ?? (previewTask?.failures.map((f) => f.reason).join('；') || '未知原因')}`}
            <div style={{ marginTop: 10 }}>
              <button className="btn btn-secondary" onClick={onBackToEdit}>
                返回修改
              </button>
            </div>
          </div>
        )}
    </div>
  );
}
