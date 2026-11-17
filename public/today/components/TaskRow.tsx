import { useState } from 'react';
import { points } from '../../../src/shared/personal.ts';
import type { ScoringRule } from '../../../src/shared/personal.ts';
import type { Task, TaskResolution } from '../../../src/shared/tasks.ts';
import { dateText } from '../view-options.ts';
import { cueLine } from '../../../src/shared/habits.ts';
import type { HabitInsight } from '../../../src/shared/habits.ts';
import { HabitTrack } from './HabitCard.tsx';
import { CheckIcon, CloseIcon, MoonIcon, PencilIcon, StarIcon } from './Icons.tsx';

interface TaskRowProps {
  task: Task;
  today: string;
  busy: boolean;
  // A duration habit is recorded with Log minutes on its day, not with a checkbox.
  completable?: boolean;
  rule?: ScoringRule | undefined;
  insight?: HabitInsight | undefined;
  onResolve(id: string, status: TaskResolution): Promise<boolean>;
  onReopen?(id: string): void;
  onEdit?(task: Task): void;
  // Today's focus: a star on open one-off tasks. A full focus disables new stars.
  focus?: { on: boolean; full: boolean; toggle(task: Task): void } | undefined;
}

export function TaskRow({ task, today, busy, completable = true, rule, insight, onResolve, onReopen, onEdit, focus }: TaskRowProps) {
  // The circle fills at once; it empties again only if saving fails.
  const [checking, setChecking] = useState(false);
  const pending = task.status === 'pending';
  const late = pending && !task.frequency && task.plannedDate < today;
  const statusLabel = task.status === 'completed' ? 'Completed' : task.status === 'missed' ? 'Missed'
    : task.recurrenceId ? 'Rest day' : 'Cancelled';
  const cue = cueLine(rule);

  return (
    <div className={`task ${pending ? '' : 'resolved'} ${checking ? 'checking' : ''}`}>
      {pending ? completable ? (
        <input
          className="check"
          type="checkbox"
          aria-label={`Complete ${task.title}`}
          checked={checking}
          disabled={busy || checking}
          onChange={async () => {
            setChecking(true);
            if (!await onResolve(task.id, 'completed')) setChecking(false);
          }}
        />
      ) : <span className="check placeholder" aria-hidden="true" />
        : <span className={`check mark ${task.status}`} aria-hidden="true">{task.status === 'completed' ? <CheckIcon /> : '–'}</span>}
      <div className="task-content">
        <span className="task-title">{task.title}</span>
        <div className="task-meta">
          <span>{task.frequency ? (task.frequency === 'daily' ? 'Daily' : 'Weekly') + ' · ' : ''}{dateText(task.plannedDate)}</span>
          {late && <span className="overdue">Overdue</span>}
          {pending && !completable && <span>Log minutes on the day</span>}
          {cue && pending && <span className="cue">{cue}</span>}
          {!pending && <>
            <span className={`state ${task.status}`}>{statusLabel}</span>
            {task.resolvedAt && <span>{new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(task.resolvedAt))}</span>}
          </>}
        </div>
        {pending && rule?.starter && <p className="starter">Two-minute start: {rule.starter}</p>}
        {pending && rule?.identity && <p className="identity"><span>Vote for </span>{rule.identity}</p>}
        {insight && <HabitTrack insight={insight} />}
      </div>
      {pending && rule?.mode === 'complete' && rule.rate > 0 && <span className="points-badge" title="Points when done">+{points(rule.rate)}</span>}
      {pending && focus && <button className={`icon-button star ${focus.on ? 'on' : ''}`} disabled={busy || checking || (!focus.on && focus.full)}
        aria-pressed={focus.on} aria-label={`Focus on ${task.title} today`}
        title={focus.on ? "Remove from today's focus" : focus.full ? 'Focus already has three tasks' : "Add to today's focus"}
        onClick={() => focus.toggle(task)}><StarIcon /></button>}
      {onEdit && <button className="icon-button" disabled={busy} aria-label={`Edit plan for ${task.title}`} title="Edit plan"
        onClick={() => onEdit(task)}><PencilIcon /></button>}
      {/* Skipping a repeating occurrence is a planned rest day; it never breaks the habit chain. */}
      {pending && task.recurrenceId && <button className="icon-button" disabled={busy || checking} aria-label={`Rest today ${task.title}`}
        title="Rest today" onClick={() => void onResolve(task.id, 'cancelled')}><MoonIcon /></button>}
      {pending && !task.recurrenceId && <button className="icon-button" disabled={busy || checking} aria-label={`Cancel ${task.title}`}
        title="Cancel" onClick={() => void onResolve(task.id, 'cancelled')}><CloseIcon /></button>}
      {!pending && onReopen && <button className="text-button" disabled={busy} aria-label={`Reopen ${task.title}`}
        onClick={() => onReopen(task.id)}>Reopen</button>}
    </div>
  );
}
