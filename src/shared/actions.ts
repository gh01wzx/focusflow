import type { ProjectTicket, ProjectView } from './projects.ts';
import { canStartTicket } from './dependencies.ts';
export interface ActionTicket { ticket: ProjectTicket; project: string; milestone: string }
export function projectActions(views: ProjectView[]) {
  const tickets: ActionTicket[] = views.flatMap(view => view.tickets.map(ticket => ({
    ticket, project: view.projects.find(p => p.id === ticket.projectId)!.title,
    milestone: view.milestones.find(m => m.id === ticket.milestoneId)!.title,
  }))).sort((a, b) => a.ticket.createdAt < b.ticket.createdAt ? -1 : a.ticket.createdAt > b.ticket.createdAt ? 1
    : a.ticket.id < b.ticket.id ? -1 : a.ticket.id > b.ticket.id ? 1 : 0);
  return { review: tickets.filter(t => t.ticket.status === 'review'),
    active: tickets.filter(t => t.ticket.status === 'in_progress'),
    next: tickets.find(t => views.some(view => view.selectedProjectId === t.ticket.projectId
      && canStartTicket(t.ticket, view.tickets, view.dependencies))) ?? null };
}
