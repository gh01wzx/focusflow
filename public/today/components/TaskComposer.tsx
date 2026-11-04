import type { Frequency } from '../../../src/shared/tasks.ts';
import type { TodayController } from '../useTodayController.ts';

type ComposerState = Pick<TodayController,
  'title' | 'plannedDate' | 'frequency' | 'busy' | 'titleInput' | 'add'
  | 'setTitle' | 'setPlannedDate' | 'setFrequency' | 'view'>;

export function TaskComposer({ state }: { state: ComposerState }) {
  const { view, title, plannedDate, frequency, busy } = state;
  const disabled = !view || busy;
  return (
    <>
      <form className="composer" onSubmit={state.add}>
        <label className="sr-only" htmlFor="task-title">Task title</label>
        <span className="add-symbol" aria-hidden="true">+</span>
        <input
          id="task-title"
          ref={state.titleInput}
          value={title}
          onChange={event => state.setTitle(event.target.value)}
          maxLength={300}
          placeholder="What needs doing?"
          autoComplete="off"
          required
          disabled={disabled}
        />
        <div className="date-field">
          <label htmlFor="planned-date">{frequency === 'none' ? 'Planned date' : 'First date'}</label>
          <input
            id="planned-date"
            aria-label="Planned date"
            type="date"
            value={plannedDate}
            min={frequency === 'none' ? undefined : view?.today}
            onChange={event => state.setPlannedDate(event.target.value)}
            required
            disabled={disabled}
          />
        </div>
        <div className="date-field">
          <label htmlFor="repeat-frequency">Repeat</label>
          <select
            id="repeat-frequency"
            value={frequency}
            onChange={event => state.setFrequency(event.target.value as 'none' | Frequency)}
            disabled={disabled}
          >
            <option value="none">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        <button className="primary" type="submit" disabled={disabled || !title.trim()}>
          {busy ? 'Saving.' : 'Add task'}<span aria-hidden="true">?</span>
        </button>
      </form>
      {frequency !== 'none' && (
        <p className="repeat-help">
          {frequency === 'daily'
            ? 'A new task each local day.'
            : 'A task for each 7-day period, starting on the first date.'}
          {' '}Unfinished periods move to History.
        </p>
      )}
    </>
  );
}
