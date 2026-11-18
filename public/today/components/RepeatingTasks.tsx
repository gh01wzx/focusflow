import { t } from '../../workspace/locale.ts';
import { useState } from 'react';
import type { RecurrenceRule } from '../../../src/shared/tasks.ts';
import { dateText } from '../view-options.ts';
import { WEEKDAYS } from '../../../src/shared/weekdays.ts';

interface RepeatingTasksProps {
  rules: RecurrenceRule[];
  habits?: boolean;
  busy: boolean;
  onEdit(rule: RecurrenceRule): void;
  onStop(id: string): Promise<void>;
}

export function RepeatingTasks({ rules, habits, busy, onEdit, onStop }: RepeatingTasksProps) {
  // Stopping cancels every future occurrence and cannot be undone, so it takes a second click.
  const [confirming, setConfirming] = useState<string | null>(null);
  if (rules.length === 0) return null;
  return (
    <details className="recurrences">
      <summary>{t(habits ? "Habit schedules (" : "Repeating tasks (")}{rules.length})</summary>
      <p>{t("Stop future repeats here. The current period stays available; cancelling a task only skips that occurrence.")}</p>
      <ul className="task-list">
        {rules.map(rule => (
          <li className="task" key={rule.id}>
            <div className="task-content">
              <span className="task-title">{rule.title} · {rule.frequency === 'daily' ? t('Daily') : t('Weekly')}</span>
              <div className="task-meta">{t("From")} {dateText(rule.startDate)}</div>
              {rule.frequency === 'weekly' && <div className="task-meta">
                {rule.weekdays === null ? t('Every 7 days from the first date (existing schedule)')
                  : WEEKDAYS.filter(day => rule.weekdays!.includes(day.value)).map(day => t(day.label)).join(', ')}
              </div>}
            </div>
            <button type="button" className="text-button" disabled={busy} aria-label={t("Edit plan for {0}", rule.title)}
              onClick={() => onEdit(rule)}>{t("Edit plan")}</button>
            {confirming === rule.id ? <div className="confirm-actions" role="group" aria-label={t("Stop repeating {0}?", rule.title)}>
              <span>{t("Stop all future repeats?")}</span>
              <button className="danger-button" disabled={busy} aria-label={t("Confirm stop repeating {0}", rule.title)}
                onClick={() => { setConfirming(null); void onStop(rule.id); }}>{t("Stop")}</button>
              <button className="cancel" disabled={busy} aria-label={t("Keep repeating {0}", rule.title)}
                onClick={() => setConfirming(null)}>{t("Keep")}</button>
            </div> : <button
              className="cancel"
              disabled={busy}
              aria-label={t("Stop repeating {0}", rule.title)}
              onClick={() => setConfirming(rule.id)}
            >
              {t("Stop repeating")}
            </button>}
          </li>
        ))}
      </ul>
    </details>
  );
}
