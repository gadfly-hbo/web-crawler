export function StageBar({ stage }: { stage: 1 | 2 }) {
  const item = (no: number, name: string, state: 'done' | 'current' | 'todo') => (
    <span className={`stage ${state}`}>
      <span className="no">{no}</span>
      {name}
    </span>
  );
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
