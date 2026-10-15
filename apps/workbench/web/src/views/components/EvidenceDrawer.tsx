import { useEffect, useState } from 'react';

export interface FieldEvidenceItem {
  id: string;
  taskId: string;
  recordId: string;
  snapshotId: string;
  field: string;
  value: any;
  sourceText: string;
  selectorOrPattern?: string;
  lineStart: number;
  lineEnd: number;
  charOffsetStart: number;
  charOffsetEnd: number;
  confidence: number;
  extractorType: 'css' | 'regex' | 'llm' | 'manual';
  extractedAt: string;
}

export interface ManualRevisionItem {
  id: string;
  taskId: string;
  recordId: string;
  field: string;
  oldValue: any;
  newValue: any;
  reason: string;
  author: string;
  revisedAt: string;
}

interface EvidenceDrawerProps {
  taskId: string;
  recordId: string;
  field: string;
  fieldLabel: string;
  currentValue: any;
  onClose: () => void;
  onRevisionSaved?: () => void;
}

export function EvidenceDrawer({
  taskId,
  recordId,
  field,
  fieldLabel,
  currentValue,
  onClose,
  onRevisionSaved,
}: EvidenceDrawerProps) {
  const [evidence, setEvidence] = useState<FieldEvidenceItem | null>(null);
  const [revisions, setRevisions] = useState<ManualRevisionItem[]>([]);
  const [snapshotLines, setSnapshotLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // 人工修正表单状态
  const [showReviseForm, setShowReviseForm] = useState(false);
  const [newValueInput, setNewValueInput] = useState(String(currentValue ?? ''));
  const [reasonInput, setReasonInput] = useState('');
  const [authorInput, setAuthorInput] = useState('审核员');
  const [submitting, setSubmitting] = useState(false);
  const [reviseError, setReviseError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    setLoading(true);

    Promise.all([
      fetch(`/api/tasks/${taskId}/evidence?recordId=${recordId}&field=${field}`).then((r) => r.json()),
      fetch(`/api/tasks/${taskId}/revisions`).then((r) => r.json()),
    ])
      .then(([evRes, revRes]) => {
        if (canceled) return;
        const evList: FieldEvidenceItem[] = evRes.evidences || [];
        const found = evList[0] || null;
        setEvidence(found);

        const revList: ManualRevisionItem[] = revRes.revisions || [];
        const matchedRevs = revList.filter((r) => r.recordId === recordId && r.field === field);
        setRevisions(matchedRevs);

        if (found && found.snapshotId) {
          fetch(`/api/tasks/${taskId}/snapshot-content?snapshotId=${found.snapshotId}`)
            .then((r) => r.json())
            .then((snapRes) => {
              if (!canceled && snapRes.lines) {
                setSnapshotLines(snapRes.lines);
              }
            })
            .catch(() => {});
        }
      })
      .catch((err) => {
        console.error('Failed to load evidence', err);
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });

    return () => {
      canceled = true;
    };
  }, [taskId, recordId, field]);

  const handleSubmitRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reasonInput.trim()) {
      setReviseError('请填写修正理由');
      return;
    }

    setSubmitting(true);
    setReviseError(null);

    try {
      const parsedNewVal = !Number.isNaN(Number(newValueInput)) && field === 'price'
        ? Number(newValueInput)
        : newValueInput;

      const res = await fetch(`/api/tasks/${taskId}/revisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordId,
          field,
          oldValue: currentValue,
          newValue: parsedNewVal,
          reason: reasonInput,
          author: authorInput,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '保存失败');
      }

      const resData = await res.json();
      setRevisions((prev) => [resData.revision, ...prev]);
      setShowReviseForm(false);
      setReasonInput('');
      if (onRevisionSaved) onRevisionSaved();
    } catch (err: any) {
      setReviseError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 560,
        maxWidth: '90vw',
        background: '#ffffff',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'inherit',
      }}
    >
      {/* 抽屉头部 */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid #eee',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#fcfbf9',
        }}
      >
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#b44626', textTransform: 'uppercase' }}>
            Evidence & Lineage Trace
          </span>
          <h3 style={{ margin: '4px 0 0 0', fontSize: 16, color: '#1a202c' }}>
            证据链下钻：{fieldLabel} ({field})
          </h3>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            fontSize: 20,
            cursor: 'pointer',
            color: '#888',
            padding: 4,
          }}
        >
          ✕
        </button>
      </div>

      {/* 抽屉主体 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {loading ? (
          <div style={{ color: '#888', padding: 20 }}>⏳ 正在溯源快照与证据索引...</div>
        ) : (
          <>
            {/* 核心元数据卡片 */}
            <div
              style={{
                border: '1px solid #ebe9e4',
                borderRadius: 8,
                padding: 14,
                background: '#faf8f5',
                marginBottom: 16,
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
                <div>
                  <span style={{ color: '#666' }}>记录 ID: </span>
                  <code style={{ fontSize: 12, background: '#eee', padding: '2px 4px', borderRadius: 3 }}>
                    {recordId}
                  </code>
                </div>
                <div>
                  <span style={{ color: '#666' }}>字段当前值: </span>
                  <strong style={{ color: '#b44626' }}>{String(currentValue ?? 'null')}</strong>
                </div>
                <div>
                  <span style={{ color: '#666' }}>抽取引擎: </span>
                  <span
                    style={{
                      padding: '2px 6px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      background: evidence?.extractorType === 'llm' ? '#e9d8fd' : '#e2e8f0',
                      color: evidence?.extractorType === 'llm' ? '#553c9a' : '#2d3748',
                    }}
                  >
                    {evidence ? evidence.extractorType.toUpperCase() : 'UNKNOWN'}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#666' }}>置信度: </span>
                  <span>{evidence ? `${(evidence.confidence * 100).toFixed(0)}%` : '-'}</span>
                </div>
                {evidence?.selectorOrPattern && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: '#666' }}>提取规则/模式: </span>
                    <code style={{ fontSize: 11, color: '#3182ce', wordBreak: 'break-all' }}>
                      {evidence.selectorOrPattern}
                    </code>
                  </div>
                )}
                {evidence?.snapshotId && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: '#666' }}>原始快照 ID: </span>
                    <span style={{ fontSize: 12, color: '#4a5568' }}>{evidence.snapshotId}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 人工修订留痕清单 */}
            {revisions.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: 13, color: '#2b6cb0' }}>📝 人工修订审计留痕 ({revisions.length})</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {revisions.map((rev) => (
                    <div
                      key={rev.id}
                      style={{
                        padding: '10px 12px',
                        borderLeft: '3px solid #3182ce',
                        background: '#ebf8ff',
                        borderRadius: 4,
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, color: '#2c5282' }}>
                          原值: {String(rev.oldValue)} ➔ 修正值: {String(rev.newValue)}
                        </span>
                        <span style={{ color: '#718096', fontSize: 11 }}>{new Date(rev.revisedAt).toLocaleString()}</span>
                      </div>
                      <div style={{ color: '#4a5568' }}>理由: {rev.reason}</div>
                      <div style={{ color: '#718096', fontSize: 11, marginTop: 2 }}>修订人: {rev.author}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 人工修正入口 */}
            <div style={{ marginBottom: 20 }}>
              {!showReviseForm ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowReviseForm(true)}
                  style={{ fontSize: 12, padding: '4px 10px' }}
                >
                  ✏️ 人工修正此字段值
                </button>
              ) : (
                <form
                  onSubmit={handleSubmitRevision}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 6,
                    padding: 12,
                    background: '#f7fafc',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: '#2d3748' }}>
                    提交人工修正 (将追加留痕，不篡改原始快照)
                  </div>
                  {reviseError && <div style={{ color: '#e53e3e', fontSize: 12, marginBottom: 8 }}>{reviseError}</div>}
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#4a5568', marginBottom: 2 }}>修正后的新值:</label>
                    <input
                      type="text"
                      className="input"
                      value={newValueInput}
                      onChange={(e) => setNewValueInput(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      required
                    />
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#4a5568', marginBottom: 2 }}>
                      修正理由 (必填审计项):
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={reasonInput}
                      onChange={(e) => setReasonInput(e.target.value)}
                      placeholder="例：折后价标于附注，正文标价有误"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      required
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowReviseForm(false)}
                      style={{ fontSize: 12 }}
                    >
                      取消
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={submitting} style={{ fontSize: 12 }}>
                      {submitting ? '提交中...' : '确认留痕'}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* 快照原文高亮查看区 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h4 style={{ margin: 0, fontSize: 13, color: '#2d3748' }}>
                  📄 快照原文定位 (第 {evidence?.lineStart ?? 1} 行)
                </h4>
                {evidence && (
                  <span style={{ fontSize: 11, color: '#718096' }}>
                    偏移: {evidence.charOffsetStart} ~ {evidence.charOffsetEnd}
                  </span>
                )}
              </div>

              {snapshotLines.length > 0 ? (
                <div
                  style={{
                    border: '1px solid #cbd5e0',
                    borderRadius: 6,
                    background: '#2d3748',
                    color: '#f7fafc',
                    fontFamily: 'monospace',
                    fontSize: 12,
                    maxHeight: 280,
                    overflowY: 'auto',
                    padding: '8px 0',
                  }}
                >
                  {snapshotLines.map((line, idx) => {
                    const lineNum = idx + 1;
                    const isTargetLine = evidence && lineNum >= evidence.lineStart && lineNum <= evidence.lineEnd;
                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          padding: '2px 10px',
                          background: isTargetLine ? 'rgba(237, 137, 54, 0.35)' : 'transparent',
                          borderLeft: isTargetLine ? '3px solid #ed8936' : '3px solid transparent',
                        }}
                      >
                        <span
                          style={{
                            width: 38,
                            color: isTargetLine ? '#fbd38d' : '#718096',
                            userSelect: 'none',
                            textAlign: 'right',
                            marginRight: 12,
                            fontWeight: isTargetLine ? 700 : 'normal',
                          }}
                        >
                          {lineNum}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            color: isTargetLine ? '#fff' : '#e2e8f0',
                            fontWeight: isTargetLine ? 600 : 'normal',
                          }}
                        >
                          {line || ' '}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  style={{
                    padding: 16,
                    background: '#f7fafc',
                    border: '1px dashed #cbd5e0',
                    borderRadius: 6,
                    fontSize: 12,
                    color: '#718096',
                  }}
                >
                  快照内容暂未加载或文本为空
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
