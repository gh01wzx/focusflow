import { personalDefaults, type PersonalPreferences } from './personal.ts';

export type FeedbackSettings = Pick<PersonalPreferences, 'sound' | 'volume' | 'reducedMotion'>;
export interface InterfaceSettings extends FeedbackSettings {
  language: 'en' | 'zh-CN';
  start: 'personal' | 'projects';
  size: 'standard' | 'large';
}
export const defaultInterface: InterfaceSettings = {
  language: 'en', start: 'personal', size: 'standard',
  sound: personalDefaults.sound, volume: personalDefaults.volume, reducedMotion: personalDefaults.reducedMotion,
};
export function isInterface(value: unknown): value is InterfaceSettings {
  if (!value || typeof value !== 'object') return false;
  return 'language' in value && (value.language === 'en' || value.language === 'zh-CN') &&
    'start' in value && (value.start === 'personal' || value.start === 'projects') &&
    'size' in value && (value.size === 'standard' || value.size === 'large') &&
    'sound' in value && typeof value.sound === 'boolean' &&
    'reducedMotion' in value && typeof value.reducedMotion === 'boolean' &&
    'volume' in value && typeof value.volume === 'number' && Number.isFinite(value.volume) && value.volume >= 0 && value.volume <= 1;
}
