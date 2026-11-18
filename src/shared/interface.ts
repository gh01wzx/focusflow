export interface InterfaceSettings {
  language: 'en' | 'zh-CN';
  start: 'personal' | 'projects';
  size: 'standard' | 'large';
}
export const defaultInterface: InterfaceSettings = { language: 'en', start: 'personal', size: 'standard' };
export function isInterface(value: unknown): value is InterfaceSettings {
  if (!value || typeof value !== 'object') return false;
  return 'language' in value && (value.language === 'en' || value.language === 'zh-CN') &&
    'start' in value && (value.start === 'personal' || value.start === 'projects') &&
    'size' in value && (value.size === 'standard' || value.size === 'large');
}
