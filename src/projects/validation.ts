import { isTicketStatus } from '../shared/projects.ts';
import type { EntityDraft, TicketDraft, TicketDetailsDraft, TicketStatus } from '../shared/projects.ts';

export class ProjectInputError extends Error {}
export class ProjectNotFoundError extends Error {}

function record(input: unknown): Record<string, unknown> {
  return typeof input === 'object' && input !== null ? input as Record<string, unknown> : {};
}
export function entityInput(input: unknown): EntityDraft {
  const value = record(input);
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.trim().length > 300) {
    throw new ProjectInputError('Enter a title with 1 to 300 characters.');
  }
  const description = value.description ?? '';
  if (typeof description !== 'string' || description.length > 2000) {
    throw new ProjectInputError('Keep the description within 2000 characters.');
  }
  return { title: value.title.trim(), description };
}
export function parentId(input: unknown, field: 'projectId' | 'milestoneId'): string {
  const id = record(input)[field];
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) {
    throw new ProjectInputError(field === 'projectId' ? 'Choose a project.' : 'Choose a milestone.');
  }
  return id;
}
export function ticketDetailsInput(input: unknown): TicketDetailsDraft {
  const value = record(input);
  if (value.executionMode !== undefined && value.executionMode !== 'manual') {
    throw new ProjectInputError('Only manual tickets are available in this version.');
  }
  const acceptanceCriteria = value.acceptanceCriteria ?? '';
  if (typeof acceptanceCriteria !== 'string' || acceptanceCriteria.length > 2000) {
    throw new ProjectInputError('Keep acceptance criteria within 2000 characters.');
  }
  return { ...entityInput(input), acceptanceCriteria };
}
export function ticketInput(input: unknown): TicketDraft {
  return { ...ticketDetailsInput(input), milestoneId: parentId(input, 'milestoneId') };
}
export function ticketStatus(input: unknown): TicketStatus {
  if (!isTicketStatus(input)) throw new ProjectInputError('Choose a valid ticket status.');
  return input;
}
export function blockerInput(input: unknown): string {
  const value = record(input).reason;
  if (typeof value !== 'string' || value.length > 1000) throw new ProjectInputError('Describe the blocker using at most 1000 characters, or clear it explicitly.');
  return value.trim();
}
export function prerequisiteInput(input: unknown): string[] {
  const ids = record(input).prerequisiteIds;
  if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id))
    || new Set(ids).size !== ids.length) throw new ProjectInputError('Choose each prerequisite once from this project.');
  return [...ids].sort();
}
