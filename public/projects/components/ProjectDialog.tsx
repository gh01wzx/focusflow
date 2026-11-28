import { t } from '../../workspace/locale.ts';
import { useLayoutEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

export function ProjectDialog({ title, locked, onClose, children, returnFocusId, centered = false }: {
  returnFocusId?: string;
  centered?: boolean;
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
  // The heading stays in place and only the body scrolls, so the scroll bar sits inside the rounded
  // corners and the heading needs no background of its own.
  return <dialog ref={dialog} className={centered ? "ai-dialog settings-dialog" : "project-dialog"} aria-labelledby={heading}
    onCancel={event => { event.preventDefault(); if (!locked) onClose(); }}>
    <header className="dialog-heading">
      <h2 id={heading}>{title}</h2>
      <button type="button" className="secondary-button" disabled={locked} onClick={onClose}
        aria-label={t('Close ') + title}>{t("Close")}</button>
    </header>
    <div className="dialog-body">{children}</div>
  </dialog>;
}
