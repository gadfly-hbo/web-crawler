/** 任务列表分区纯函数（G3 + UI 裁决②）：五类目数据驱动，空类目交视图层隐藏。 */
import type { TaskRecord } from '../../../shared/task';
import { type TaskCategory, CATEGORY_ORDER, getTaskCategory } from '../../../shared/task-params';

export interface TaskPartition {
  preview: TaskRecord[];
  byCategory: Record<TaskCategory, TaskRecord[]>;
}

export function partitionTasks(tasks: TaskRecord[]): TaskPartition {
  const byCategory = Object.fromEntries(
    CATEGORY_ORDER.map((cat) => [cat, [] as TaskRecord[]]),
  ) as Record<TaskCategory, TaskRecord[]>;
  const preview: TaskRecord[] = [];
  for (const t of tasks) {
    if (t.dryRun) {
      preview.push(t);
      continue;
    }
    byCategory[getTaskCategory(t.params)].push(t);
  }
  return { preview, byCategory };
}
