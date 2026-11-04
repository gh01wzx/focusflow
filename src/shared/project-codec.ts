import { isTicketStatus } from './projects.ts';
import type { Project, Milestone, ProjectTicket, ProjectView } from './projects.ts';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function timestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}
function project(value: unknown): value is Project {
  return record(value) && typeof value.id === 'string' && typeof value.title === 'string'
    && typeof value.description === 'string' && timestamp(value.createdAt);
}
function milestone(value: unknown): value is Milestone {
  return project(value) && 'projectId' in value && typeof value.projectId === 'string';
}
function ticket(value: unknown): value is ProjectTicket {
  return record(value) && typeof value.id === 'string' && typeof value.projectId === 'string'
    && typeof value.milestoneId === 'string'
    && typeof value.title === 'string' && typeof value.description === 'string'
    && typeof value.acceptanceCriteria === 'string' && isTicketStatus(value.status)
    && value.executionMode === 'manual' && timestamp(value.createdAt) && timestamp(value.updatedAt);
}
export function parseProject(value: unknown): Project {
  if (!project(value)) throw new Error('Invalid stored project.');
  return value;
}
export function parseMilestone(value: unknown): Milestone {
  if (!milestone(value)) throw new Error('Invalid stored milestone.');
  return value;
}
export function parseProjectTicket(value: unknown): ProjectTicket {
  if (!ticket(value)) throw new Error('Invalid stored project ticket.');
  return value;
}
export function parseProjectView(value: unknown): ProjectView {
  const fail = () => new Error('Could not read your projects. Restart FocusFlow and try again.');
  if (!record(value) || !Array.isArray(value.projects) || !value.projects.every(project)
    || !Array.isArray(value.milestones) || !value.milestones.every(milestone)
    || !Array.isArray(value.tickets) || !value.tickets.every(ticket)
    || (value.selectedProjectId !== null && typeof value.selectedProjectId !== 'string')) throw fail();
  const selected = value.selectedProjectId;
  const milestones = value.milestones;
  if (selected !== null && !value.projects.some(item => item.id === selected)) throw fail();
  if (value.milestones.some(item => item.projectId !== selected)
    || value.tickets.some(item => item.projectId !== selected
      || !milestones.some(parent => parent.id === item.milestoneId))) throw fail();
  return { projects: value.projects, selectedProjectId: selected, milestones: value.milestones, tickets: value.tickets };
}
