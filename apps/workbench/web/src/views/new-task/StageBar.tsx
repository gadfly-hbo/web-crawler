export function StageBar({ stage, direct }: { stage: 1 | 2; direct?: boolean }) {
  const item = (no: number, name: string, state: 'done' | 'current' | 'todo') => (
    <span className={`stage ${state}`}>
      <span className="no">{no}</span>
      {name}
    </span>
  );
  // direct：直采场景（RSS）两段式——无预览阶段，导航不宣称永不发生的步骤（UI 合同裁决④）
  if (direct) {
    return (
      <div className="stagebar">
        {item(1, '选择范围', stage === 1 ? 'current' : 'done')}
        <span className="stage-sep">→</span>
        {item(2, '开始采集', 'todo')}
      </div>
    );
  }
  return (
    <div className="stagebar">
      {item(1, '选择范围', stage === 1 ? 'current' : 'done')}
      <span className="stage-sep">→</span>
      {item(2, '预览确认', stage === 2 ? 'current' : 'todo')}
      <span className="stage-sep">→</span>
      {item(3, '开始采集', 'todo')}
    </div>
  );
}
