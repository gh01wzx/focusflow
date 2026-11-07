import { useEffect, useRef, useState } from 'react';
import { createProjectClient } from '../../src/client/projects.ts';
import type { EntityDraft, ProjectView, TicketDraft, TicketDetailsDraft, TicketStatus } from '../../src/shared/projects.ts';

const client = createProjectClient();

export function useProjectsController(initialProjectId?: string) {
  const [view, setView] = useState<ProjectView | null>(null);
  const [milestoneId, setMilestoneId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<{ kind: 'project' | 'milestone' | 'ticket'; id: string } | null>(null);
  const selectedProject = useRef<string | undefined>(initialProjectId);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);

  function apply(next: ProjectView, newMilestone = '') {
    const sameProject = selectedProject.current === next.selectedProjectId;
    selectedProject.current = next.selectedProjectId ?? undefined;
    setView(next);
    setMilestoneId(current => {
      const candidate = newMilestone || (sameProject ? current : '');
      return next.milestones.some(item => item.id === candidate) ? candidate : next.milestones[0]?.id ?? '';
    });
  }
  async function refresh() {
    if (busyRef.current) return;
    const token = ++generation.current;
    try {
      const next = await client.read(selectedProject.current);
      if (mounted.current && token === generation.current) { apply(next); setError(''); }
    } catch (failure) {
      if (mounted.current && token === generation.current) {
        setError(failure instanceof Error ? failure.message : 'Could not load projects.');
      }
    }
  }
  useEffect(() => {
    mounted.current = true;
    const visible = () => { if (!document.hidden) void refresh(); };
    void refresh();
    const timer = setInterval(visible, 30_000);
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    return () => {
      mounted.current = false;
      ++generation.current;
      clearInterval(timer);
      window.removeEventListener('focus', visible);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);

  async function run(operation: () => Promise<ProjectView>, success: string, selectNewMilestone = false): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    ++generation.current;
    setBusy(true);
    setError('');
    setMessage('');
    const oldIds = new Set(view?.milestones.map(item => item.id));
    try {
      const next = await operation();
      if (!mounted.current) return false;
      const added = selectNewMilestone ? next.milestones.find(item => !oldIds.has(item.id))?.id : undefined;
      apply(next, added);
      setMessage(success);
      return true;
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Could not save. Please try again.');
      return false;
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return {
    view, milestoneId, busy, error, message, refresh, editing,
    clearError: () => { if (!busyRef.current) setError(''); },
    clearFeedback: () => { if (!busyRef.current) { setError(''); setMessage(''); } },
    beginEdit: (kind: 'project' | 'milestone' | 'ticket', id: string) => {
      if (!busyRef.current && !editing) { setError(''); setMessage(''); setEditing({ kind, id }); }
    },
    cancelEdit: () => { if (!busyRef.current) { setEditing(null); setError(''); } },
    saveEdit: async (draft: TicketDetailsDraft) => {
      if (!editing) return false;
      const { kind, id } = editing;
      const saved = await run(() => kind === 'ticket' ? client.editTicket(id, draft)
        : kind === 'project' ? client.editProject(id, { title: draft.title, description: draft.description })
        : client.editMilestone(id, { title: draft.title, description: draft.description }), 'Changes saved.');
      if (saved && mounted.current) setEditing(null);
      return saved;
    },
    selectProject: (id: string) => run(() => client.read(id), ''),
    selectMilestone: (id: string) => { if (!busyRef.current) setMilestoneId(id); },
    addProject: (draft: EntityDraft) => run(() => client.addProject(draft), 'Project added.'),
    addMilestone: (draft: EntityDraft) => run(
      () => client.addMilestone(selectedProject.current ?? '', draft), 'Milestone added.', true,
    ),
    addTicket: (draft: TicketDraft) => run(() => client.addTicket(draft), 'Ticket added.'),
    setPrerequisites: (id: string, ids: string[]) => run(() => client.setPrerequisites(id, ids), 'Prerequisites saved.'),
    setStatus: (id: string, status: TicketStatus) => run(() => client.setStatus(id, status), 'Ticket updated.'),
  };
}
