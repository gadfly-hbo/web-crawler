import { STATUS_LABELS, STATUS_TONES, type TaskRecord } from '../../../shared/task';

export function StatusChip({ status }: { status: TaskRecord['status'] }) {
  const tone = STATUS_TONES[status];
  return (
    <span className={`chip chip-${tone}`}>
      <span className={`dot dot-${tone}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}
