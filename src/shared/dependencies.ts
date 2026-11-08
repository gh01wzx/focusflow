import type { ProjectTicket, TicketDependency } from './projects.ts';

export function unfinishedPrerequisites(id: string, tickets: ProjectTicket[], dependencies: TicketDependency[]) {
  const ids = new Set(dependencies.filter(link => link.ticketId === id).map(link => link.prerequisiteId));
  return tickets.filter(ticket => ids.has(ticket.id) && ticket.status !== 'done');
}
export function canStartTicket(ticket: ProjectTicket, tickets: ProjectTicket[], dependencies: TicketDependency[]) {
  return ticket.executionMode === 'manual' && ticket.status === 'backlog' && !isTicketBlocked(ticket, tickets, dependencies);
}
export function canStartCodingTicket(ticket: ProjectTicket,tickets: ProjectTicket[],dependencies: TicketDependency[]) {
  return ticket.executionMode==='codex'&&!!ticket.coding?.issueNumber&&!!ticket.coding.repository&&ticket.status==='backlog'&&!isTicketBlocked(ticket,tickets,dependencies);
}
export function isTicketBlocked(ticket: ProjectTicket, tickets: ProjectTicket[], dependencies: TicketDependency[]) {
  return ticket.status !== 'done' && (!!ticket.blockReason || unfinishedPrerequisites(ticket.id, tickets, dependencies).length > 0);
}
export function reachesTicket(from: string, target: string, dependencies: TicketDependency[]): boolean {
  const pending = [from];
  const seen = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    pending.push(...dependencies.filter(link => link.ticketId === id).map(link => link.prerequisiteId));
  }
  return false;
}
