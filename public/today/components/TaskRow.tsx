import type { Task, TaskResolution } from '../../../src/shared/tasks.ts';
import { dateText } from '../view-options.ts';
import { CheckIcon } from './CheckIcon.tsx';

interface TaskRowProps {
  task: Task;
  today: string;
  busy: boolean;
  onResolve(id: string, status: TaskResolution): Promise<void>;
}

export function TaskRow({ task, today, busy, onResolve }: TaskRowProps) {
  const pending = task.status === 'pending';
  const late = pending && !task.frequency && task.plannedDate < today;
  const statusLabel = task.status === 'completed' ? 'Completed'
    : task.status === 'missed' ? 'Missed' : 'Cancelled';

  return (
    <li className={`task ${pending ? '' : 'resolved'}`}>
      {pending ? (
        <input
          className="task-check"
          type="checkbox"
          aria-label={`Complete ${task.title}`}
          checked={false}
          disabled={busy}
          onChange={() => void onResolve(task.id, 'completed')}
        />
      ) : (
        <span className={`resolved-mark ${task.status}`}>
          {task.status === 'completed' ? <CheckIcon /> : <span aria-hidden="true">-</span>}
        </span>
      )}
      <div className="task-content">
        <span className="task-title">{task.title}</span>
        <div className="task-meta">
          <span>Planned {dateText(task.plannedDate)}</span>
          {task.frequency && <span>{task.frequency === 'daily' ? 'Daily' : 'Weekly'}</span>}
          {late && <span className="overdue">Overdue</span>}
          {!pending && (
            <>
              <span className={`state ${task.status}`}>{statusLabel}</span>
              {task.resolvedAt && (
                <span>
                  {new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(task.resolvedAt))}
                </span>
              )}
            </>
          )}
        </div>
      </div>
      {pending && (
        <button
          className="cancel"
          disabled={busy}
          aria-label={`Cancel ${task.title}`}
          onClick={() => void onResolve(task.id, 'cancelled')}
        >
          Cancel
        </button>
      )}
    </li>
  );
}
