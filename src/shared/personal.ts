export interface ScoringRule {
  subject: string;
  mode: 'minutes' | 'complete';
  rate: number;
  target: number;
  cue: string;
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
  rewards: Reward[];
  entries: ActivityEntry[];
  progress: Record<string, number>;
  preferences: PersonalPreferences;
}

export const personalDefaults: PersonalPreferences = {
  sound: true, volume: 0.25, reducedMotion: false, pinnedReward: '',
};

export const points = (value: number) => (value / 100).toLocaleString('en', { maximumFractionDigits: 2 });
