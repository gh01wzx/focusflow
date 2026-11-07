import type { ExecutionMode } from '../../../src/shared/projects.ts';

export function ExecutionChoice({ id, value, disabled, onChange }: {
  id: string; value: ExecutionMode; disabled: boolean; onChange(value: ExecutionMode): void;
}) {
  return <>
    <label htmlFor={id}>Work type</label>
    <select id={id} value={value} disabled={disabled}
      onChange={event => onChange(event.target.value as ExecutionMode)}>
      <option value="manual">Manual</option><option value="codex">Coding with Codex</option>
    </select>
    <p className="project-description">Manual work stays local. Coding work is saved as an unpublished draft; publication and Start are separate actions.</p>
  </>;
}
