// A plan follows the four habit laws: an obvious cue (habit stacking, time and place),
// an attractive pairing, an easy two-minute start and the identity each completion supports.
export interface HabitPlan {
  cue: string;
  identity: string;
  time: string;
  place: string;
  starter: string;
  bundle: string;
}
export const PLAN_LIMITS: Record<keyof HabitPlan, number> = { cue: 180, identity: 120, time: 5, place: 80, starter: 180, bundle: 180 };
export const emptyPlan: HabitPlan = { cue: '', identity: '', time: '', place: '', starter: '', bundle: '' };

export interface ScoringRule extends HabitPlan {
  subject: string;
  mode: 'minutes' | 'complete';
  // Accumulated quantity uses the legacy minutes field for either unit.
  unit?: 'minutes' | 'count';
  rate: number;
  target: number;
  // A habit's check-in and maintain amounts on the way to its target. Null uses the defaults.
  start?: number | null;
  maintain?: number | null;
  // The quarterly goal this plan works toward, if any.
  goalId?: string | null;
  // Days a week for a flexible weekly habit; each day with a check-in counts once.
  timesPerWeek?: number | null;
}

// A habit's goal bonus: earned points with no minutes and no rate (see the log action).
export function isGoalBonus(entry: Pick<ActivityEntry, 'kind' | 'minutes' | 'rate' | 'amount'>): boolean {
  return entry.kind === 'earn' && entry.minutes === 0 && entry.rate === 0 && entry.amount > 0;
}

// Scoring and plan details sent when a task or habit is created.
export interface PlanDraft extends HabitPlan {
  rate: number;
  target: number;
  start?: number | null;
  maintain?: number | null;
  goalId?: string | null;
  timesPerWeek?: number | null;
}

export interface Reward {
  id: string;
  title: string;
  cost: number;
  note: string;
  onceOnly: boolean;
  archived: boolean;
  used: boolean;
}

export interface ActivityEntry {
  id: string;
  kind: 'earn' | 'redeem' | 'reverse' | 'edit';
  subject: string;
  title: string;
  day: string;
  loggedAt: string;
  minutes: number;
  unit?: 'minutes' | 'count';
  rate: number;
  amount: number;
  reference: string | null;
}

export interface PersonalPreferences {
  sound: boolean;
  volume: number;
  reducedMotion: boolean;
  pinnedReward: string;
}

export interface PersonalView {
  day: string;
  earned: number;
  balance: number;
  rules: ScoringRule[];
  identities: string[];
  rewards: Reward[];
  entries: ActivityEntry[];
  progress: Record<string, number>;
  // minutes: habit -> day -> logged minutes; points: day -> points earned that day.
  week: { days: string[]; minutes: Record<string, Record<string, number>>; points: Record<string, number> };
  // Repeating habit -> day -> outcome, for occurrences in the 14 days before today.
  recent: Record<string, Record<string, Outcome>>;
  // Identity votes by identity key: occurrences completed or with logged minutes, today included.
  votes: Record<string, number>;
  preferences: PersonalPreferences;
  // The pause that covers today or starts later, if any. Habits rest on its days.
  pause: { start: string; end: string } | null;
}

// How a past habit occurrence ended. Minutes below the target still count as showing up (started).
export type Outcome = 'done' | 'started' | 'missed' | 'rest';

export const personalDefaults: PersonalPreferences = {
  sound: true, volume: 0.25, reducedMotion: false, pinnedReward: '',
};

export const points = (value: number) => (value / 100).toLocaleString('en', { maximumFractionDigits: 2 });
