import type { TaskFailure } from '../../../shared/task';

export function FailureList(props: {
  failures: TaskFailure[];
  title?: string;
  className?: string;
}) {
  const { failures, title, className = 'fail-card' } = props;
  if (!failures || failures.length === 0) return null;

  return (
    <div className={className}>
      {title ?? `以下内容未能采集（${failures.length} 处）：`}
      <ul>
        {failures.map((f, i) => {
          const itemDesc = f.target
            ? `检索「${f.target}」`
            : [f.code, f.name, f.title].filter(Boolean).join(' ');
          return (
            <li key={i}>
              {itemDesc}：{f.reason}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
