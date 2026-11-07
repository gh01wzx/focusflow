import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { inTransaction } from '../database/connection.ts';
import { localDay, nextOccurrence } from '../shared/calendar.ts';
import { createTaskRepository } from '../tasks/repository.ts';
import { createTaskService } from '../tasks/service.ts';
import type { TaskTransaction } from '../tasks/service.ts';
import { createProjectRepository } from '../projects/repository.ts';
import { createProjectService } from '../projects/service.ts';
import type { TicketStatus } from '../shared/projects.ts';
import { createPlanRepository } from '../plans/repository.ts';

export function seedSampleData(db: DatabaseSync, now: Date): void {
  inTransaction(db, () => {
    // The outer transaction makes all examples one atomic initial write.
    const transaction: TaskTransaction = operation => operation(now);
    const tasks = createTaskService(createTaskRepository(db), transaction, randomUUID);
    const projects = createProjectService(createProjectRepository(db), transaction, randomUUID);
    const today = localDay(now);
    tasks.add({ title: 'Try completing this sample task', plannedDate: today });
    tasks.add({ title: 'A sample task for tomorrow', plannedDate: nextOccurrence(today, 'daily') });
    tasks.addRecurrence({ title: 'Sample daily check-in', plannedDate: today, frequency: 'daily' });
    const project = projects.addProject({ title: 'Sample project',
      description: 'A practice project with 12 tickets across three milestones. Open Status board to compare all four statuses. Changes stay in this sample workspace.' });
    const plan = projects.addMilestone({ projectId: project.id, title: 'Plan the demo',
      description: 'Try an available Backlog ticket and prepare the input needed by later work.' });
    const build = projects.addMilestone({ projectId: project.id, title: 'Build the demo',
      description: 'Compare active, review and blocked tickets, including a prerequisite from another milestone.' });
    const review = projects.addMilestone({ projectId: project.id, title: 'Review the demo',
      description: 'Check saved changes and finish the goal before starting its dependent Backlog ticket.' });
    function add(milestoneId: string, status: TicketStatus, title: string, description: string, acceptanceCriteria: string) {
      const ticket = projects.addTicket({ milestoneId, title, description, acceptanceCriteria });
      projects.setStatus(ticket.id, status);
      return ticket;
    }
    add(plan.id, 'backlog', 'Move this sample ticket',
      'Open this card and try its status buttons. Close and reopen the same review to check persistence.',
      'The card appears once in its chosen column, and its status remains after restarting.');
    const goal = add(plan.id, 'backlog', 'Write the demo goal',
      'Describe a small outcome. Two tickets in later milestones need this input.',
      'The goal describes one outcome and an observable way to check it.');
    const fields = add(plan.id, 'done', 'Choose the card fields',
      'This completed example already provides input for arranging the cards.',
      'Each card shows its title, status and milestone.');
    add(plan.id, 'done', 'Gather example tasks',
      'A completed example for inspecting Done cards and editing their details.',
      'Descriptions and acceptance criteria are available in each example.');
    const cards = add(build.id, 'in_progress', 'Arrange the task cards',
      'An active task with a completed prerequisite in Plan the demo.',
      'All four columns are visible by scrolling horizontally, with distinct boundaries.');
    const layout = add(build.id, 'review', 'Check the narrow-window layout',
      'Inspect this example in Review. Resize the window and scroll across the board.',
      'Columns remain separate and cards can still be opened at the minimum window width.');
    add(build.id, 'backlog', 'Add a short column guide',
      'An unstarted example for testing Backlog details and text editing.',
      'A new user can explain what each status means.');
    const image = add(build.id, 'backlog', 'Wait for the example image',
      'This Backlog card has a manual blocker and needs Write the demo goal in another milestone. The card links directly to that prerequisite.',
      'Finish the goal and clear the manual reason once the image arrives; then start the ticket explicitly.');
    add(review.id, 'in_progress', 'Check changes after restart',
      'An active example in a different milestone. Change one card and reopen this review name.',
      'The same ticket identity, text, status and prerequisite links are retained.');
    add(review.id, 'review', 'Review the example acceptance steps',
      'A second review item to compare cards from different milestones in the same column.',
      'Every acceptance step describes an observable result.');
    const dependent = add(review.id, 'backlog', 'Start after the demo goal is done',
      'This Backlog card cannot start yet. Its prerequisite is Write the demo goal in Plan the demo.',
      'In Progress is refused until the goal is Done. Finishing the goal does not start this card automatically.');
    const feedback = add(review.id, 'backlog', 'Wait for layout feedback',
      'This Blocked example depends on the layout check currently in Review.',
      'Visit the layout check, finish it and explicitly choose this ticket\'s next status.');
    projects.setPrerequisites(cards.id, { prerequisiteIds: [fields.id] });
    projects.setPrerequisites(image.id, { prerequisiteIds: [goal.id] });
    projects.setPrerequisites(dependent.id, { prerequisiteIds: [goal.id] });
    projects.setPrerequisites(feedback.id, { prerequisiteIds: [layout.id] });
    projects.setBlocker(image.id, { reason: 'Waiting for an example image from outside this project.' });
    createPlanRepository(db).save({ id: randomUUID(), projectId: project.id, goal: 'Try editing and approving a small plan without a model call.',
      createdAt: now.toISOString(), plan: { milestones: [{ key: 'sample-draft', title: 'Try a saved plan', description: 'Sample suggestions, not a model response.', tickets: [
        { key: 'sample-prepare', title: 'Prepare a sample input', description: 'Edit this task, or exclude it together with its dependent.',
          acceptanceCriteria: 'One input is available.', executionMode: 'manual', prerequisiteKeys: [] },
        { key: 'sample-code', title: 'Build a sample tool', description: 'This coding suggestion stays unpublished and cannot start after approval.',
          acceptanceCriteria: 'The sample output matches the input.', executionMode: 'codex', prerequisiteKeys: ['sample-prepare'] },
        { key: 'sample-optional', title: 'An optional suggestion', description: 'Try excluding this task before approval.',
          acceptanceCriteria: 'Only selected tasks become real tickets.', executionMode: 'manual', prerequisiteKeys: [] },
      ] }] } });
  });
}
