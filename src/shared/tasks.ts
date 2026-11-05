export type TaskStatus = 'pending' | 'completed' | 'cancelled' | 'missed';
export type Frequency = 'daily' | 'weekly';
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export interface RecurrenceRule {
  id: string;
  title: string;
  frequency: Frequency;
  weekdays: Weekday[] | null;
  startDate: string;
  nextDate: string | null;
  createdAt: string;
  stoppedAt: string | null;
}
export interface Task {
  id: string;
  title: string;
  plannedDate: string;
  status: TaskStatus;
  createdAt: string;
  resolvedAt: string | null;
  recurrenceId: string | null;
  frequency: Frequency | null;
}
export interface TaskView {
  today: string;
  due: Task[];
  upcoming: Task[];
  history: Task[];
  recurrences: RecurrenceRule[];
}

export type TaskResolution = 'completed' | 'cancelled';
export interface TaskDraft {
  title: string;
  plannedDate: string;
  frequency: 'none' | Frequency;
  weekdays?: Weekday[];
}
