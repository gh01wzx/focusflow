import { useEffect,useState } from 'react';
import type { CodingApproval } from '../../../src/shared/approvals.ts';
import { createApprovalClient } from '../../../src/client/approvals.ts';

const api=createApprovalClient();
export function CodingApprovalPanel({ticketId,disabled}:{ticketId: string;disabled: boolean}) {
  const [approval,setApproval]=useState<CodingApproval|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let active=true,inflight=false;
    const read=async()=>{if(inflight)return;inflight=true;try {const value=await api.read(ticketId);if(active)setApproval(value);}catch {if(active)setError('Could not refresh permission requests. No action was allowed.');}finally{inflight=false;}};
    void read();const timer=setInterval(()=>void read(),2000);return()=>{active=false;clearInterval(timer);};
  },[ticketId]);
  async function decide(decision:'accept'|'decline') {
    if(!approval||busy)return;setBusy(true);setError('');
    try{setApproval(await api.decide(ticketId,{id:approval.id,runId:approval.runId,decision,confirm:decision==='accept'}));}
    catch(cause){setError(cause instanceof Error?cause.message:'Could not send the decision.');}finally{setBusy(false);}
  }
  if(!approval)return error?<p role="alert">{error}</p>:null;
  return <section className="coding-run" aria-label="Coding permission request"><h3>Permission needed</h3>
    <p>{approval.reason||'Codex requested permission for the following action.'}</p>
    <p>{approval.kind==='command'?'Command':'File change'} in <code>{approval.workingDirectory}</code></p>
    {approval.command&&<pre>{approval.command}</pre>}{approval.paths.map(path=><p key={path}><code>{path}</code></p>)}
    <p>Allow applies once to this request. Denying does not undo earlier changes. This preview does not establish private-file read isolation or verified Windows sandbox enforcement.</p>
    <button disabled={busy||disabled} onClick={()=>void decide('accept')}>Allow once</button>{' '}
    <button disabled={busy} onClick={()=>void decide('decline')}>Deny</button>{error&&<p role="alert">{error}</p>}
  </section>;
}
