import type { MouseEvent, ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Transition } from 'motion/react';
import { spring } from './Animated.tsx';

// Rows and controls inside a card keep their own clicks.
const OWN_CLICKS = 'li, a, input, select, textarea, label, button:not(.fold-toggle)';
const fold: Transition = { duration: 0.28, ease: [0.32, 0.72, 0, 1] };

// A list card that folds to its heading. The card itself is the control: a click on its heading,
// notes or background folds or opens it, with no arrow. The heading is a button, so the keyboard
// and screen readers can do the same.
export function FoldCard({ title, count, badges, folded, reduced, busy, className = '', onToggle, children }: {
  title: string; count?: number | undefined; badges?: ReactNode; folded: boolean; reduced: boolean;
  busy?: boolean; className?: string; onToggle(): void; children: ReactNode;
}) {
  function click(event: MouseEvent<HTMLElement>) {
    if (event.target instanceof Element && event.target.closest(OWN_CLICKS)) return;
    // Selecting text in the heading or a note is not a fold.
    if (window.getSelection()?.type === 'Range') return;
    onToggle();
  }
  return <motion.section layout="position" transition={spring} aria-label={title} aria-busy={busy} onClick={click}
    className={`list-group glass fold-card${folded ? ' folded' : ''}${className ? ' ' + className : ''}`}>
    <div className="group-heading">
      <h2><button type="button" className="fold-toggle" aria-expanded={!folded}>
        {title}{count !== undefined && <span className="count">{count}</span>}</button></h2>
      {badges}
    </div>
    <AnimatePresence initial={false}>
      {!folded && <motion.div key="body" className="fold-body" initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={reduced ? { duration: 0 } : fold}>
        {children}
      </motion.div>}
    </AnimatePresence>
  </motion.section>;
}
