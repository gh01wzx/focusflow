import { WEEKDAYS } from '../../../src/shared/weekdays.ts';
import type { Weekday } from '../../../src/shared/tasks.ts';

interface WeekdayPickerProps {
  selected: Weekday[];
  disabled: boolean;
  onChange(days: Weekday[]): void;
}

export function WeekdayPicker({ selected, disabled, onChange }: WeekdayPickerProps) {
  return (
    <fieldset className="weekday-picker" disabled={disabled} aria-describedby="weekday-help">
      <legend>Repeat on</legend>
      <div className="weekday-options">
        {WEEKDAYS.map(day => (
          <label key={day.value}>
            <input type="checkbox" aria-label={day.name} checked={selected.includes(day.value)}
              onChange={event => onChange(event.target.checked
                ? [...selected, day.value] : selected.filter(value => value !== day.value))} />
            <span>{day.label}</span>
          </label>
        ))}
      </div>
      <p id="weekday-help">Choose one or more days. Each selected day is a separate task.</p>
    </fieldset>
  );
}
