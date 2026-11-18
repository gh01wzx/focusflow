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
}

// Scoring and plan details sent when a task or habit is created.
export interface PlanDraft extends HabitPlan {
  rate: number;
  target: number;
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
}

// How a past habit occurrence ended. Minutes below the target still count as showing up (started).
export type Outcome = 'done' | 'started' | 'missed' | 'rest';

export const personalDefaults: PersonalPreferences = {
  sound: true, volume: 0.25, reducedMotion: false, pinnedReward: '',
};

export const points = (value: number) => (value / 100).toLocaleString('en', { maximumFractionDigits: 2 });
