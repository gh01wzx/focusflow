import type { Project, Milestone, ProjectTicket, ProjectView } from '../shared/projects.ts';
import type { ProjectRepository } from './repository.ts';
import { entityInput, parentId, ticketInput, ticketDetailsInput, prerequisiteInput, blockerInput, ticketStatus, ProjectNotFoundError, ProjectInputError } from './validation.ts';
import { canStartTicket, reachesTicket, unfinishedPrerequisites } from '../shared/dependencies.ts';

export type ProjectTransaction = <T>(operation: (now: Date) => T) => T;

export function createProjectService(repository: ProjectRepository, transaction: ProjectTransaction, nextId: () => string) {
  return {
    assertRepositoryChange: (projectId: string, repositoryId: unknown): void => transaction(() => {
      if (repository.listTickets(projectId).some(ticket => ticket.coding?.issueNumber && ticket.coding.repository?.id !== repositoryId)) {
        throw new ProjectInputError('This project has published coding work. Keep its repository; use a new project for another repository.');
      }
    }),
    editProject: (id: string, input: unknown): string => transaction(() => {
      const value = entityInput(input);
      if (!repository.findProject(id)) throw new ProjectNotFoundError('Project not found.');
      repository.editProject(id, value);
      return id;
    }),
    editMilestone: (id: string, input: unknown): string => transaction(() => {
      const value = entityInput(input);
      const milestone = repository.findMilestone(id);
      if (!milestone) throw new ProjectNotFoundError('Milestone not found.');
      repository.editMilestone(id, value);
      return milestone.projectId;
    }),
    editTicket: (id: string, input: unknown): string => transaction(now => {
      const value = ticketDetailsInput(input);
      const ticket = repository.findTicket(id);
      if (!ticket) throw new ProjectNotFoundError('Ticket not found.');
      if (value.executionMode !== undefined && value.executionMode !== ticket.executionMode) {
        if (ticket.status !== 'backlog' || ticket.coding?.issueNumber) {
          throw new ProjectInputError('Only an unpublished Backlog ticket can change its execution mode.');
        }
        repository.setExecutionMode(id, value.executionMode, now.toISOString());
      }
      repository.editTicket(id, value, now.toISOString());
      return ticket.projectId;
    }),
    actions: (): ProjectView[] => transaction(() => repository.listProjects().map(project => ({
      projects: [project], selectedProjectId: project.id,
      milestones: repository.listMilestones(project.id), tickets: repository.listTickets(project.id),
      dependencies: repository.listDependencies(project.id),
    }))),
    start: (id: string): void => transaction(now => {
      const ticket = repository.findTicket(id);
      if (!ticket) throw new ProjectNotFoundError('Ticket not found.');
      if (ticket.status !== 'backlog') throw new ProjectInputError('This ticket is no longer in Backlog. Refresh before choosing another task.');
      if (ticket.executionMode === 'codex') throw new ProjectInputError('Coding work needs an approved published Issue and a verified coding runner before Start is available.');
      if (ticket.blockReason) throw new ProjectInputError('Clear this ticket\'s blocker before starting it.');
      if (!canStartTicket(ticket, repository.listTickets(ticket.projectId), repository.listDependencies(ticket.projectId))) {
        throw new ProjectInputError('Finish this ticket\'s prerequisites before starting it.');
      }
      repository.setStatus(id, 'in_progress', now.toISOString());
    }),
    setPrerequisites: (id: string, input: unknown): string => transaction(now => {
      const ids = prerequisiteInput(input);
      const ticket = repository.findTicket(id);
      if (!ticket) throw new ProjectNotFoundError('Ticket not found.');
      const tickets = repository.listTickets(ticket.projectId);
      const dependencies = repository.listDependencies(ticket.projectId);
      for (const prerequisite of ids) {
        if (prerequisite === id) throw new ProjectInputError('A ticket cannot depend on itself.');
        if (!tickets.some(item => item.id === prerequisite)) throw new ProjectInputError('Choose a prerequisite from the same project.');
        if (reachesTicket(prerequisite, id, dependencies.filter(link => link.ticketId !== id))) {
          throw new ProjectInputError('These prerequisites would form a cycle. Remove the circular link.');
        }
      }
      const previous = dependencies.filter(link => link.ticketId === id).map(link => link.prerequisiteId).sort();
      if (JSON.stringify(ids) !== JSON.stringify(previous)) repository.setDependencies(id, ids, now.toISOString());
      return ticket.projectId;
    }),
    setBlocker: (id: string, input: unknown): string => transaction(now => {
      const reason = blockerInput(input);
      const ticket = repository.findTicket(id);
      if (!ticket) throw new ProjectNotFoundError('Ticket not found.');
      repository.setBlocker(id, reason, now.toISOString());
      return ticket.projectId;
    }),
    view: (id?: string): ProjectView => transaction(() => {
      const projects = repository.listProjects();
      const selected = id === undefined ? projects[0] : repository.findProject(id);
      if (id !== undefined && !selected) throw new ProjectNotFoundError('Project not found.');
      return {
        projects, selectedProjectId: selected?.id ?? null,
        milestones: selected ? repository.listMilestones(selected.id) : [],
        tickets: selected ? repository.listTickets(selected.id) : [],
        dependencies: selected ? repository.listDependencies(selected.id) : [],
      };
    }),
    addProject: (input: unknown): Project => transaction(now => {
      const value = { id: nextId(), ...entityInput(input), createdAt: now.toISOString() };
      repository.insertProject(value);
      return value;
    }),
    addMilestone: (input: unknown): Milestone => transaction(now => {
      const projectId = parentId(input, 'projectId');
      if (!repository.findProject(projectId)) throw new ProjectNotFoundError('Project not found.');
      const value = { id: nextId(), projectId, ...entityInput(input), createdAt: now.toISOString() };
      repository.insertMilestone(value);
      return value;
    }),
    addTicket: (input: unknown): ProjectTicket => transaction(now => {
      const draft = ticketInput(input);
      const milestone = repository.findMilestone(draft.milestoneId);
      if (!milestone) throw new ProjectNotFoundError('Milestone not found.');
      const value: ProjectTicket = { id: nextId(), projectId: milestone.projectId,
        ...draft, status: 'backlog', blockReason: '', executionMode: draft.executionMode ?? 'manual',
        createdAt: now.toISOString(), updatedAt: now.toISOString() };
      repository.insertTicket(value);
      return repository.findTicket(value.id)!;
    }),
    setStatus: (id: string, input: unknown): string => transaction(now => {
      const status = ticketStatus(input);
      const ticket = repository.findTicket(id);
      if (!ticket) throw new ProjectNotFoundError('Ticket not found.');
      if (ticket.executionMode === 'codex' && status !== ticket.status) {
        throw new ProjectInputError('Coding progress comes from its run and Done requires an observed pull request merge.');
      }
      if (status === 'in_progress' && ticket.status !== 'in_progress' && ticket.blockReason) {
        throw new ProjectInputError('Clear this ticket\'s blocker before moving it to In Progress.');
      }
      if (status === 'in_progress' && ticket.status !== 'in_progress'
        && unfinishedPrerequisites(id, repository.listTickets(ticket.projectId), repository.listDependencies(ticket.projectId)).length) {
        throw new ProjectInputError('Finish the prerequisites before moving this ticket to In Progress.');
      }
      repository.setStatus(id, status, now.toISOString());
      return ticket.projectId;
    }),
  };
}
export type ProjectService = ReturnType<typeof createProjectService>;
