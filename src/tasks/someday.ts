import type { DatabaseSync } from 'node:sqlite';
import type { SomedayItem } from '../shared/someday.ts';
import type { Task } from '../shared/tasks.ts';
import { TaskInputError } from './validation.ts';

// SQL for ideas without a date.
export function createSomedayRepository(db: DatabaseSync) {
  return {
    list: () => db.prepare('SELECT id,title,created_at AS createdAt FROM someday_items ORDER BY created_at DESC, id').all()
      .map(row => ({ id: String(row.id), title: String(row.title), createdAt: String(row.createdAt) })),
    find(id: string): SomedayItem | undefined {
      const row = db.prepare('SELECT id,title,created_at AS createdAt FROM someday_items WHERE id=?').get(id);
      return row ? { id: String(row.id), title: String(row.title), createdAt: String(row.createdAt) } : undefined;
    },
    insert: (item: SomedayItem) => { db.prepare('INSERT INTO someday_items(id,title,created_at) VALUES(?,?,?)').run(item.id, item.title, item.createdAt); },
    remove: (id: string) => { db.prepare('DELETE FROM someday_items WHERE id=?').run(id); },
  };
}

// Capture an idea now and give it a date when it fits. Planning turns it into a one-off task and
// removes the idea in the same transaction.
export function createSomeday(repository: ReturnType<typeof createSomedayRepository>,
  addTask: (input: unknown, afterAdd: (task: Task) => void) => Task, nextId: () => string, clock: () => Date) {
  return {
    list: () => repository.list(),
    add(input: unknown) {
      const title = input && typeof input === 'object' ? (input as Record<string, unknown>).title : undefined;
      if (typeof title !== 'string' || !title.trim() || title.trim().length > 300) throw new TaskInputError('Enter an idea with 1 to 300 characters.');
      repository.insert({ id: nextId(), title: title.trim(), createdAt: clock().toISOString() });
      return repository.list();
    },
    schedule(id: string, input: unknown) {
      const item = repository.find(id);
      if (!item) throw new TaskInputError('This idea is no longer in Someday.');
      const plannedDate = input && typeof input === 'object' ? (input as Record<string, unknown>).plannedDate : undefined;
      addTask({ title: item.title, plannedDate }, () => repository.remove(id));
      return repository.list();
    },
    remove(id: string) {
      repository.remove(id);
      return repository.list();
    },
  };
}
export type Someday = ReturnType<typeof createSomeday>;
