import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

export function ProjectDialog({ title, locked, onClose, children }: {
  title: string; locked: boolean; onClose(): void; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
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
