import { isHabit } from '../../../src/shared/tasks.ts';
import { t } from '../../workspace/locale.ts';
import { useState } from 'react';
import { points } from '../../../src/shared/personal.ts';
import type { ScoringRule } from '../../../src/shared/personal.ts';
import type { Task, TaskResolution } from '../../../src/shared/tasks.ts';
import { dateText } from '../view-options.ts';
import { cueLine } from '../../../src/shared/habits.ts';
import type { HabitInsight } from '../../../src/shared/habits.ts';
import { HabitTrack, VoteCount } from './HabitCard.tsx';
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
  // Votes cast so far for the identity in this habit's plan.
  votes?: number;
}

export function TaskRow({ task, today, busy, completable = true, rule, insight, onResolve, onReopen, onEdit, focus, votes = 0 }: TaskRowProps) {
  // The circle fills at once; it empties again only if saving fails.
  const [checking, setChecking] = useState(false);
  const habit = isHabit(task);
  const pending = task.status === 'pending';
  const late = pending && !task.frequency && task.plannedDate < today;
  const statusLabel = task.status === 'completed' ? 'Completed' : task.status === 'missed' ? 'Missed'
    : habit ? 'Rest day' : 'Cancelled';
  const cue = cueLine(rule);

  return (
    <div data-category={habit ? 'habit' : 'task'} className={`task ${pending ? '' : 'resolved'} ${checking ? 'checking' : ''}`}>
      {pending ? completable ? (
        <input
          className="check"
          type="checkbox"
          aria-label={t(habit ? 'Check in {0}' : 'Complete {0}', task.title)}
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
          <span>{task.frequency ? (task.frequency === 'daily' ? t('Daily') : t('Weekly')) + ' · ' : ''}{dateText(task.plannedDate)}</span>
          {late && <span className="overdue">{t("Overdue")}</span>}
          {pending && !completable && <span>{t("Log minutes on the day")}</span>}
          {cue && pending && <span className="cue">{cue}</span>}
          {!pending && <>
            <span className={`state ${task.status}`}>{t(statusLabel)}</span>
            {task.resolvedAt && <span>{new Intl.DateTimeFormat(document.documentElement.lang, { month: 'short', day: 'numeric' }).format(new Date(task.resolvedAt))}</span>}
          </>}
        </div>
        {pending && rule?.starter && <p className="starter">{t("Two-minute start:")} {rule.starter}</p>}
        {pending && rule?.identity && <p className="identity"><span>{t("Vote for")} </span>{rule.identity}<VoteCount votes={votes} /></p>}
        {insight && <HabitTrack insight={insight} />}
      </div>
      {pending && rule?.mode === 'complete' && rule.rate > 0 && <span className="points-badge" title={t("Points when done")}>+{points(rule.rate)}</span>}
      {pending && focus && <button className={`icon-button star ${focus.on ? 'on' : ''}`} disabled={busy || checking || (!focus.on && focus.full)}
        aria-pressed={focus.on} aria-label={t("Focus on {0} today", task.title)}
        title={focus.on ? t("Remove from today's focus") : focus.full ? t('Focus already has three tasks') : t("Add to today's focus")}
        onClick={() => focus.toggle(task)}><StarIcon /></button>}
      {onEdit && <button className="icon-button" disabled={busy} aria-label={t("Edit plan for {0}", task.title)} title={t("Edit plan")}
        onClick={() => onEdit(task)}><PencilIcon /></button>}
      {/* Skipping a repeating occurrence is a planned rest day; it never breaks the habit chain. */}
      {pending && habit && <button className="icon-button" disabled={busy || checking} aria-label={t("Rest today {0}", task.title)}
        title={t("Rest today")} onClick={() => void onResolve(task.id, 'cancelled')}><MoonIcon /></button>}
      {pending && !habit && <button className="icon-button" disabled={busy || checking} aria-label={t("Cancel {0}", task.title)}
        title={t("Cancel")} onClick={() => void onResolve(task.id, 'cancelled')}><CloseIcon /></button>}
      {!pending && onReopen && <button className="text-button" disabled={busy} aria-label={t("Reopen {0}", task.title)}
        onClick={() => onReopen(task.id)}>{t("Reopen")}</button>}
    </div>
  );
}
