export const TICKET_STATUSES = ['backlog', 'in_progress', 'review', 'done'] as const;
export type TicketStatus = typeof TICKET_STATUSES[number];
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  backlog: 'Backlog', in_progress: 'In Progress', review: 'Review', done: 'Done',
};

export interface Project {
  id: string;
  title: string;
  description: string;
  createdAt: string;
}
export interface Milestone extends Project {
  projectId: string;
}
export interface ProjectTicket {
  id: string;
  projectId: string;
  milestoneId: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  status: TicketStatus;
  blockReason: string;
  executionMode: 'manual';
  createdAt: string;
  updatedAt: string;
}
export interface ProjectView {
  projects: Project[];
  selectedProjectId: string | null;
  milestones: Milestone[];
  tickets: ProjectTicket[];
  dependencies: TicketDependency[];
}
export interface TicketDependency { ticketId: string; prerequisiteId: string }
export interface EntityDraft {
  title: string;
  description: string;
}
export interface TicketDetailsDraft extends EntityDraft {
  acceptanceCriteria: string;
}
export interface TicketDraft extends TicketDetailsDraft {
  milestoneId: string;
}
export function isTicketStatus(value: unknown): value is TicketStatus {
  return TICKET_STATUSES.some(status => status === value);
}
