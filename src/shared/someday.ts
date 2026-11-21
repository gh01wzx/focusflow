// An idea without a date, waiting in the Someday list.
export interface SomedayItem {
  id: string;
  title: string;
  createdAt: string;
}

export function parseSomedayItems(value: unknown): SomedayItem[] {
  if (!Array.isArray(value) || !value.every(item => item && typeof item === 'object'
    && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.createdAt === 'string')) {
    throw new Error('Could not read the Someday list.');
  }
  return value as SomedayItem[];
}
