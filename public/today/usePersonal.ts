import type { FeedbackSettings } from '../../src/shared/interface.ts';
import { useEffect, useRef, useState } from 'react';
import { readPersonal } from '../../src/client/personal.ts';
import type { PersonalView } from '../../src/shared/personal.ts';
import type { Task, TaskResolution } from '../../src/shared/tasks.ts';

export function usePersonal(revision: object | null, refreshTasks: () => Promise<void>, feedback: FeedbackSettings) {
  const [data, setData] = useState<PersonalView>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reward, setReward] = useState<{ id: string; points: number; target: boolean }>();
  const generation = useRef(0);
  const pending = useRef(false);
  const sound = useRef<AudioContext | null>(null);
  useEffect(() => {
    return () => { if (sound.current) void sound.current.close(); };
  }, []);
  async function refresh() {
    if (pending.current) return;
    const current = ++generation.current;
    try {
      const result = await readPersonal();
      if (current === generation.current) { setData(result.view); setError(''); }
    } catch (failure) {
      if (current === generation.current) setError(failure instanceof Error ? failure.message : 'Could not load rewards.');
    }
  }
  // Points load together with tasks when the page opens, instead of waiting for the task reply.
  // Each later task view refreshes them, because finishing or reopening a task changes points.
  const firstView = useRef(true);
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (!revision) return;
    // The opening read already covers the first task view, unless it failed.
    if (firstView.current) { firstView.current = false; if (!error) return; }
    void refresh();
  }, [revision]);
  function prepareSound() {
    if (!feedback.sound) return;
    try {
      sound.current ??= new AudioContext();
      if (sound.current.state === 'suspended') void sound.current.resume().catch(() => {});
    } catch { /* Audio is optional on this device. */ }
  }
  function celebrate(id: string, earned: number, target: boolean) {
    if (earned <= 0) return;
    setReward({ id, points: earned, target });
    const channel = sound.current;
    if (!channel || channel.state !== 'running' || !feedback.sound) return;
    for (const [index, hz] of (target ? [680, 1040, 1440] : [620, 990]).entries()) {
      const oscillator = channel.createOscillator(), gain = channel.createGain();
      const start = channel.currentTime + 0.25 + index * 0.05;
      oscillator.type = 'sine'; oscillator.frequency.value = hz;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12 * feedback.volume, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.17);
      oscillator.connect(gain); gain.connect(channel.destination);
      oscillator.start(start); oscillator.stop(start + 0.18);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
  }
  async function mutate(action: string, input: Record<string, unknown>, target?: number) {
    if (pending.current) return false;
    pending.current = true;
    if (action === 'log') prepareSound();
    const current = ++generation.current;
    setBusy(true); setError('');
    try {
      const result = await readPersonal(action, input);
      if (current === generation.current) setData(result.view);
      const subject = String(input.subject);
      const was = data?.progress[subject] ?? 0, now = result.view.progress[subject] ?? 0;
      if (result.award) celebrate(String(input.id), result.award, !!target && was < target && now >= target);
      // These change which tasks are open, so the task list reloads too.
      if (['reverse', 'edit', 'pause', 'resume'].includes(action)) await refreshTasks();
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save.');
      return false;
    } finally { pending.current = false; setBusy(false); }
  }
  // Returns whether the task was saved, so a checked circle can clear again after a failure.
  async function resolve(task: Task, status: TaskResolution, run: (id: string, status: TaskResolution) => Promise<boolean>) {
    if (pending.current) return false;
    if (status !== 'completed' || !data) return run(task.id, status);
    pending.current = true;
    ++generation.current;
    setBusy(true); setError('');
    prepareSound();
    const oldEntries = new Set(data.entries.map(entry => entry.id));
    try {
      if (!await run(task.id, status)) return false;
      const result = await readPersonal();
      setData(result.view);
      const entry = result.view.entries.find(item => item.subject === task.id && item.kind === 'earn' && !oldEntries.has(item.id));
      if (entry) celebrate(entry.id, entry.amount, false);
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not refresh points.');
      return true;
    } finally { pending.current = false; setBusy(false); }
  }
  // Saves a habit plan from the task window. Errors return to the window instead of the page.
  async function changePlan(action: 'rule' | 'remove', subject: string, update: Record<string, unknown>) {
    if (pending.current) return 'Another change is still saving. Try again in a moment.';
    pending.current = true;
    const current = ++generation.current;
    setBusy(true);
    try {
      const result = await readPersonal(action, { ...update, subject });
      if (current === generation.current) setData(result.view);
      if (update.category || action === 'remove') await refreshTasks();
      return '';
    } catch (failure) {
      return failure instanceof Error ? failure.message : 'Could not save this plan.';
    } finally { pending.current = false; setBusy(false); }
  }
  return { data, error, busy, reward, mutate, resolve, savePlan: (id: string, update: Record<string, unknown>) => changePlan('rule', id, update),
    remove: (id: string, scope: 'plan' | 'occurrence') => changePlan('remove', id, { scope }), refresh };
}

export type PersonalController = ReturnType<typeof usePersonal>;
