export const TICKET_STATUSES = ['backlog', 'ready', 'in_progress', 'review', 'done', 'blocked'] as const;
export type TicketStatus = typeof TICKET_STATUSES[number];
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  backlog: 'Backlog', ready: 'Ready', in_progress: 'In Progress',
  review: 'Review', done: 'Done', blocked: 'Blocked',
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
  executionMode: 'manual';
  createdAt: string;
  updatedAt: string;
}
export interface ProjectView {
  projects: Project[];
  selectedProjectId: string | null;
  milestones: Milestone[];
  tickets: ProjectTicket[];
}
export interface EntityDraft {
  title: string;
  description: string;
}
export interface TicketDraft extends EntityDraft {
  milestoneId: string;
  acceptanceCriteria: string;
}
export function isTicketStatus(value: unknown): value is TicketStatus {
  return TICKET_STATUSES.some(status => status === value);
}
