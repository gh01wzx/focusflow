import { useState } from 'react';
import type { RecurrenceRule } from '../../../src/shared/tasks.ts';
import { dateText } from '../view-options.ts';
import { WEEKDAYS } from '../../../src/shared/weekdays.ts';

interface RepeatingTasksProps {
  rules: RecurrenceRule[];
  busy: boolean;
  onStop(id: string): Promise<void>;
}

export function RepeatingTasks({ rules, busy, onStop }: RepeatingTasksProps) {
  // Stopping cancels every future occurrence and cannot be undone, so it takes a second click.
  const [confirming, setConfirming] = useState<string | null>(null);
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
            {confirming === rule.id ? <div className="confirm-actions" role="group" aria-label={`Stop repeating ${rule.title}?`}>
              <span>Stop all future repeats?</span>
              <button className="danger-button" disabled={busy} aria-label={`Confirm stop repeating ${rule.title}`}
                onClick={() => { setConfirming(null); void onStop(rule.id); }}>Stop</button>
              <button className="cancel" disabled={busy} aria-label={`Keep repeating ${rule.title}`}
                onClick={() => setConfirming(null)}>Keep</button>
            </div> : <button
              className="cancel"
              disabled={busy}
              aria-label={`Stop repeating ${rule.title}`}
              onClick={() => setConfirming(rule.id)}
            >
              Stop repeating
            </button>}
          </li>
        ))}
      </ul>
    </details>
  );
}
