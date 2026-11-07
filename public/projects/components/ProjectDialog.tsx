import { useLayoutEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

export function ProjectDialog({ title, locked, onClose, children, returnFocusId }: {
  returnFocusId?: string;
  title: string; locked: boolean; onClose(): void; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useLayoutEffect(() => {
    const element = dialog.current;
    const returnFocus = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      const target = returnFocusId ? document.getElementById(returnFocusId) : returnFocus;
      if (target instanceof HTMLElement && target.isConnected) target.focus();
    };
  }, []);
  return <dialog ref={dialog} className="project-dialog" aria-labelledby={heading}
    onCancel={event => { event.preventDefault(); if (!locked) onClose(); }}>
    <header className="dialog-heading">
      <h2 id={heading}>{title}</h2>
      <button type="button" className="secondary-button" disabled={locked} onClick={onClose}
        aria-label={'Close ' + title}>Close</button>
    </header>
    {children}
  </dialog>;
}
