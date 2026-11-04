export type Tab = 'due' | 'upcoming' | 'history';
export const labels: Record<Tab, string> = { due: 'Today', upcoming: 'Upcoming', history: 'History' };
export const tabText: Record<Tab, { subtitle: string; emptyTitle: string; emptyDescription: string }> = {
  due: {
    subtitle: 'A clear view of what needs doing.',
    emptyTitle: "You're clear for today",
    emptyDescription: 'Add a task above when something comes up.',
  },
  upcoming: {
    subtitle: 'Your plans for the days ahead.',
    emptyTitle: 'Nothing planned ahead',
    emptyDescription: 'Choose a future date when adding a task.',
  },
  history: {
    subtitle: 'Completed, cancelled and missed tasks.',
    emptyTitle: 'Your history starts here',
    emptyDescription: 'Completed, cancelled and missed tasks will appear here.',
  },
};
export const dateText = (date: string) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date + 'T12:00:00'));
