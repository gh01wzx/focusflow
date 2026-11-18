import { t } from '../../workspace/locale.ts';

// Long lists show their newest rows first and grow a page at a time.
export const PAGE = 20;

export function ShowMore({ hidden, onMore }: { hidden: number; onMore(): void }) {
  if (hidden <= 0) return null;
  return <button type="button" className="text-button show-more" onClick={onMore}>
    {t('Show {0} more', Math.min(hidden, PAGE))}</button>;
}
