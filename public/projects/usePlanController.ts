import { useEffect, useRef, useState } from 'react';
import { createPlanClient } from '../../src/client/plans.ts';
import type { PlanState, PlanDraft } from '../../src/shared/plans.ts';

const client = createPlanClient();
export function usePlanController(projectId: string, open: boolean) {
  const [state, setState] = useState<PlanState | null>(null);
  const [goal, setGoal] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; ++generation.current; }; }, []);
  async function run(operation: () => Promise<PlanState>, loadGoal = false) {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError(''); setConfirmed(false);
    const token = ++generation.current;
    try {
      const next = await operation();
      if (mounted.current && generation.current === token) {
        setState(next);
        if (loadGoal) setGoal(next.draft?.goal ?? '');
        return true;
      }
      return false;
    } catch (failure) {
      if (mounted.current && generation.current === token) setError(failure instanceof Error ? failure.message : 'Could not open the local plan draft.');
      return false;
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  useEffect(() => {
    if (open) void run(() => client.read(projectId), true);
    else { ++generation.current; setConfirmed(false); }
  }, [open, projectId]);
  useEffect(() => {
    if (!open || !state?.busy) return;
    let active = true; let reading = false;
    const timer = setInterval(() => {
      if (reading || busyRef.current) return;
      reading = true;
      const token = generation.current;
      void client.read(projectId).then(next => {
        if (active && mounted.current && token === generation.current && !busyRef.current) setState(next);
      }).catch(() => { if (active && mounted.current && token === generation.current) setError('Could not refresh the plan request. Close this dialog to request cancellation, then reopen it.'); })
        .finally(() => { reading = false; });
    }, 750);
    return () => { active = false; clearInterval(timer); };
  }, [open, state?.busy, projectId]);
  return { state, goal, setGoal, confirmed, setConfirmed, busy, error,
    generate: () => run(() => client.generate(projectId, goal, confirmed)),
    cancel: () => run(() => client.cancel(projectId)),
    save: (draft: PlanDraft) => run(() => client.edit(draft)),
    approve: (draft: PlanDraft, confirmed: boolean) => run(() => client.approve(draft, confirmed)),
  };
}
