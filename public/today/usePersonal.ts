import { useEffect, useRef, useState } from 'react';
import { readPersonal } from '../../src/client/personal.ts';
import type { PersonalView } from '../../src/shared/personal.ts';
import type { Task, TaskResolution } from '../../src/shared/tasks.ts';

export function usePersonal(revision: object | null, refreshTasks: () => Promise<void>) {
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
  useEffect(() => {
    const current = ++generation.current;
    void readPersonal().then(result => {
      if (current === generation.current) setData(result.view);
    }, failure => {
      if (current === generation.current) setError(failure.message);
    });
  }, [revision]);
  function prepareSound() {
    if (!data?.preferences.sound) return;
    try {
      sound.current ??= new AudioContext();
      if (sound.current.state === 'suspended') void sound.current.resume().catch(() => {});
    } catch { /* Audio is optional on this device. */ }
  }
  function celebrate(id: string, earned: number, target: boolean) {
    if (earned <= 0) return;
    setReward({ id, points: earned, target });
    const channel = sound.current;
    if (!channel || channel.state !== 'running' || !data?.preferences.sound) return;
    for (const [index, hz] of (target ? [680, 1040, 1440] : [620, 990]).entries()) {
      const oscillator = channel.createOscillator(), gain = channel.createGain();
      const start = channel.currentTime + 0.25 + index * 0.05;
      oscillator.type = 'sine'; oscillator.frequency.value = hz;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12 * data.preferences.volume, start + 0.008);
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
      if (action === 'reverse' || action === 'edit') await refreshTasks();
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save.');
      return false;
    } finally { pending.current = false; setBusy(false); }
  }
  async function resolve(task: Task, status: TaskResolution, run: (id: string, status: TaskResolution) => Promise<void>) {
    if (status !== 'completed' || !data) return run(task.id, status);
    prepareSound();
    const oldEntries = new Set(data.entries.map(entry => entry.id));
    await run(task.id, status);
    const current = ++generation.current;
    const result = await readPersonal().catch(() => null);
    if (!result || current !== generation.current) return;
    setData(result.view);
    const entry = result.view.entries.find(item => item.subject === task.id && item.kind === 'earn' && !oldEntries.has(item.id));
    if (entry) celebrate(entry.id, entry.amount, false);
  }
  return { data, error, busy, reward, mutate, resolve };
}

export type PersonalController = ReturnType<typeof usePersonal>;
