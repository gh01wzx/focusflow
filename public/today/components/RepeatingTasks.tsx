import type { RecurrenceRule } from '../../../src/shared/tasks.ts';
import { dateText } from '../view-options.ts';
import { WEEKDAYS } from '../../../src/shared/weekdays.ts';

interface RepeatingTasksProps {
  rules: RecurrenceRule[];
  busy: boolean;
  onStop(id: string): Promise<void>;
}

export function RepeatingTasks({ rules, busy, onStop }: RepeatingTasksProps) {
  if (rules.length === 0) return null;
  return (
    <details className="recurrences">
      <summary>Repeating tasks ({rules.length})</summary>
      <p>Stop future repeats here. The current period stays available; cancelling a task only skips that occurrence.</p>
      <ul className="task-list">
        {rules.map(rule => (
          <li className="task" key={rule.id}>
            <div className="task-content">
              <span className="task-title">{rule.title} · {rule.frequency === 'daily' ? 'Daily' : 'Weekly'}</span>
              <div className="task-meta">From {dateText(rule.startDate)}</div>
              {rule.frequency === 'weekly' && <div className="task-meta">
                {rule.weekdays === null ? 'Every 7 days from the first date (existing schedule)'
                  : WEEKDAYS.filter(day => rule.weekdays!.includes(day.value)).map(day => day.label).join(', ')}
              </div>}
            </div>
            <button
              className="cancel"
              disabled={busy}
              aria-label={`Stop repeating ${rule.title}`}
              onClick={() => void onStop(rule.id)}
            >
              Stop repeating
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
