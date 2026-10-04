import { useEffect } from 'react';
import { api } from '../../api';
import type { TaskRecord } from '../../../../shared/task';

export function usePreviewSync(
  task: TaskRecord | null,
  onUpdate: (t: TaskRecord) => void,
) {
  useEffect(() => {
    const id = task?.id;
    if (!id || (task.status !== 'running' && task.status !== 'queued')) return;

    let poll: ReturnType<typeof setInterval> | null = null;
    const startPoll = () => {
      if (!poll) {
        poll = setInterval(async () => {
          try {
            const t = await api.task(id);
            onUpdate(t);
            if (t.status !== 'running' && t.status !== 'queued' && poll) clearInterval(poll);
          } catch {
            if (poll) clearInterval(poll);
          }
        }, 1000);
      }
    };

    const es = new EventSource(`/api/task/${id}/events`);
    es.addEventListener('task', (e) => {
      const t = JSON.parse((e as MessageEvent).data) as TaskRecord;
      onUpdate(t);
      if (t.status !== 'running' && t.status !== 'queued') es.close();
    });
    es.onerror = () => {
      es.close();
      startPoll();
    };

    return () => {
      es.close();
      if (poll) clearInterval(poll);
    };
  }, [task?.id, task?.status, onUpdate]);
}
