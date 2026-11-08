import { randomUUID } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';
import type { CodingApproval } from '../shared/approvals.ts';
import { executionRecord } from '../shared/execution.ts';
import { ExecutionFailure } from './git.ts';

type Decision = 'accept' | 'decline' | 'cancel';
interface Pending { view: CodingApproval; finish(decision: Decision): void }
const display = (value: unknown, maximum: number) => typeof value === 'string' ? value.slice(0,maximum).replace(/((?:api[_-]?key|token|password|secret)\s*[=:]\s*)[^\s"']+/gi,'$1[redacted]') : '';

export function createApprovalBroker() {
  const pending = new Map<string, Pending>();
  function cancel(ticketId: string) { pending.get(ticketId)?.finish('cancel'); }
  return {
    state(ticketId: string): CodingApproval | null { const item=pending.get(ticketId)?.view; return item ? { ...item, paths:[...item.paths] } : null; },
    cancel,
    close() { for (const item of [...pending.values()]) item.finish('cancel'); },
    async request(ticketId: string, runId: string, workspace: string, method: string, raw: unknown, signal: AbortSignal,
      changed: (waiting: boolean) => void): Promise<Decision> {
      if (signal.aborted || pending.has(ticketId)) return 'cancel';
      const params=executionRecord(raw);
      const directory=typeof params.cwd === 'string' ? resolve(params.cwd) : workspace;
      const within=(path: string) => { const rel=relative(workspace,resolve(path)); return rel==='' || !isAbsolute(rel) && rel!=='..' && !rel.startsWith('..\\') && !rel.startsWith('../'); };
      if (!within(directory) || typeof params.grantRoot === 'string' && !within(params.grantRoot)) return 'decline';
      const kind=method==='item/commandExecution/requestApproval' ? 'command' : method==='item/fileChange/requestApproval' ? 'file' : null;
      if (!kind) return 'decline';
      const paths=Array.isArray(params.paths) ? params.paths.filter((p): p is string => typeof p==='string').slice(0,30) : [];
      if (paths.some(path=>!within(resolve(directory,path)))) return 'decline';
      const command=display(Array.isArray(params.command) ? params.command.join(' ') : params.command,4000);
      if (kind==='command' && !command.trim()) return 'decline';
      const now=Date.now(), view: CodingApproval={ id:randomUUID(),runId,ticketId,kind,command,
        workingDirectory:directory,reason:display(params.reason,2000),paths:paths.map(p=>display(p,2000)),
        createdAt:new Date(now).toISOString(),expiresAt:new Date(now+600000).toISOString() };
      return new Promise<Decision>(resolveDecision=>{
        let finished=false;
        const abort=()=>finish('cancel');
        const finish=(decision: Decision)=>{
          if (finished) return; finished=true; clearTimeout(timer); signal.removeEventListener('abort',abort);
          pending.delete(ticketId); changed(false); resolveDecision(decision);
        };
        const timer=setTimeout(()=>finish('decline'),600000);
        pending.set(ticketId,{view,finish}); signal.addEventListener('abort',abort,{once:true});
        changed(true); if (signal.aborted) finish('cancel');
      });
    },
    decide(ticketId: string, input: unknown) {
      const value=executionRecord(input), item=pending.get(ticketId);
      if (!item || item.view.id!==value.id || item.view.runId!==value.runId || Date.parse(item.view.expiresAt)<=Date.now()) {
        throw new ExecutionFailure('STALE_APPROVAL','This request is no longer active. Refresh the current coding run.');
      }
      if (value.decision!=='accept' && value.decision!=='decline') throw new ExecutionFailure('INVALID_DECISION','Choose Allow once or Deny.');
      if (value.decision==='accept' && value.confirm!==true) throw new ExecutionFailure('CONFIRM_REQUIRED','Explicitly confirm this exact request.');
      item.finish(value.decision);
    },
  };
}
export type ApprovalBroker = ReturnType<typeof createApprovalBroker>;
