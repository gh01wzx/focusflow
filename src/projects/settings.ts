import type { DatabaseSync } from 'node:sqlite';
import { isAbsolute } from 'node:path';
import { parseAiModelSelection } from '../shared/ai.ts';
import { emptyProjectSettings } from '../shared/project-settings.ts';
import type { ProjectSettings } from '../shared/project-settings.ts';
import { ProjectInputError } from './validation.ts';

export function createProjectSettings(db: DatabaseSync) {
  function read(id: string): ProjectSettings {
    const row = db.prepare('SELECT settings_json FROM project_settings WHERE project_id=?').get(id);
    return row ? JSON.parse(String(row.settings_json)) as ProjectSettings : { ...emptyProjectSettings };
  }
  return {
    read,
    ticketAi(id: string): unknown {
      const row = db.prepare('SELECT draft_json FROM ticket_ai WHERE ticket_id=?').get(id);
      return row ? JSON.parse(String(row.draft_json)) : null;
    },
    saveTicketAi(id: string, value: unknown) {
      db.prepare('INSERT INTO ticket_ai VALUES (?,?) ON CONFLICT(ticket_id) DO UPDATE SET draft_json=excluded.draft_json')
        .run(id, JSON.stringify(value));
    },
    save(id: string, input: unknown) {
      if (!input || typeof input !== 'object') throw new ProjectInputError('Enter project settings.');
      const fields = input as Record<string, unknown>;
      const current = read(id);
      if (fields.revision !== current.revision) throw new ProjectInputError('Settings changed. Reopen and try again.');
      function value(key: string, max: number) {
        const text = fields[key];
        if (typeof text !== 'string' || text.length > max) throw new ProjectInputError('Check the length of ' + key + '.');
        return text.trim();
      }
      const choices: Pick<ProjectSettings, 'planning' | 'execution' | 'review'> = {};
      for (const key of ['planning', 'execution', 'review'] as const) {
        if (fields[key] === undefined) continue;
        try { choices[key] = parseAiModelSelection(fields[key]); }
        catch { throw new ProjectInputError('Choose a valid ' + key + ' model.'); }
      }
      const budget = fields.tokenBudget ?? 0;
      if (typeof budget !== 'number' || !Number.isSafeInteger(budget) || budget < 0 || budget > 1000000) throw new ProjectInputError('Enter a whole token budget from 0 to 1000000.');
      const next = { ...choices, tokenBudget: budget, revision: current.revision + 1, requirements: value('requirements', 12000),
        decisions: value('decisions', 6000), references: value('references', 2000),
        sourcePath: value('sourcePath', 2000), preview: value('preview', 100) };
      if (next.sourcePath && !isAbsolute(next.sourcePath)) throw new ProjectInputError('Use an absolute repository folder.');
      if (next.preview && next.preview !== 'focusflow' && !/^npm run [A-Za-z0-9:_-]+$/.test(next.preview)) {
        throw new ProjectInputError('Choose focusflow or an npm run command with one script name.');
      }
      db.prepare(`INSERT INTO project_settings VALUES (?,?) ON CONFLICT(project_id)
        DO UPDATE SET settings_json=excluded.settings_json`).run(id, JSON.stringify(next));
      return next;
    },
  };
}

export function projectInstructions(settings: ProjectSettings): string {
  return [
    settings.requirements && 'Current project requirements:\n' + settings.requirements,
    settings.decisions && 'Accepted project decisions:\n' + settings.decisions,
    settings.references && 'Relevant project references:\n' + settings.references,
  ].filter(Boolean).join('\n\n');
}
