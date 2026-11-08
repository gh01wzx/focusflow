import {useEffect,useState,useRef} from 'react';
import type {CodingState} from '../../../src/shared/coding.ts';
import {createRunClient} from '../../../src/client/coding.ts';
import {CodingDeliveryPanel} from './CodingDeliveryPanel.tsx';
import {CodingReviewPanel} from './CodingReviewPanel.tsx';

const api=createRunClient();
export function CodingRunPanel({ticketId,disabled,onChanged}:{ticketId:string;disabled:boolean;onChanged():void}){
  const[state,setState]=useState<CodingState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const[scope,setScope]=useState(false),[allowance,setAllowance]=useState(false),[checks,setChecks]=useState(false),[feedback,setFeedback]=useState('');
  const[revisionPreview,setRevisionPreview]=useState<string|null>(null);
  const sequence=useRef(0),alive=useRef(true),requestBusy=useRef(false);
  useEffect(()=>{alive.current=true;let reading=false;
    const read=async()=>{if(reading||requestBusy.current)return;reading=true;const version=sequence.current;
      try{const next=await api.read(ticketId);if(alive.current&&version===sequence.current)setState(next);}catch{if(alive.current)setError('Could not refresh the saved coding run.');}finally{reading=false;}};
    void read();const timer=setInterval(()=>void read(),2000);return()=>{alive.current=false;clearInterval(timer);sequence.current++;};
  },[ticketId]);
  async function act(action:string){if(requestBusy.current)return;requestBusy.current=true;sequence.current++;setBusy(true);setError('');
    try{const next=await api.act(ticketId,action,{confirmScope:scope,confirmAllowance:allowance,requirementsToken:state?.requirementsToken,feedback,allowChecks:checks,headSha:state?.linkedHeadSha});if(alive.current){setState(next);setScope(false);setAllowance(false);setRevisionPreview(null);onChanged();}}
    catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'The coding action failed.');}
    finally{requestBusy.current=false;if(alive.current)setBusy(false);}
  }
  return <section className="coding-run" aria-label="Coding run"><h3>Coding run</h3>
    {error&&<p role="alert">{error}</p>}
    {state?.activeTicketId&&state.activeTicketId!==ticketId&&<p>Another coding task is active or uncertain. Open it from Action center before starting more work.</p>}
    {state&&(state.canStart||state.canResume)&&<div>
      <p>Start runs Codex for this ticket in its prepared worktree. It uses ChatGPT Codex allowance. Nothing is merged, deployed or published automatically.</p>
      <p>This is a local acceptance build. Real Windows sandbox enforcement and account integration have not been verified.</p>
      {state.canResume&&<><label>Revision or recovery instructions<textarea value={feedback} maxLength={8000} disabled={busy||disabled} onChange={event=>{setFeedback(event.target.value);setRevisionPreview(null);}} /></label>
        <button disabled={busy||disabled} onClick={()=>setRevisionPreview(JSON.stringify({feedback,scope:state.requirementsToken,head:state.linkedHeadSha,checks}))}>Preview revision scope</button>
        {revisionPreview&&<div><p>Continue this same ticket and prepared worktree in a fresh coding context. {state.pullNumber?'Update existing PR #'+state.pullNumber:'Do not create another ticket.'}</p>
          {state.linkedHeadSha&&<p>Observed PR head: <code>{state.linkedHeadSha}</code></p>}<pre>{feedback||'Inspect and continue the retained work within the existing ticket requirements.'}</pre>
          <p>Project checks: {checks?'Allowed for this run':'Not requested'}. Earlier review evidence does not approve new commits.</p></div>}
      </>}
      <label><input type="checkbox" checked={scope} disabled={busy||disabled} onChange={event=>setScope(event.target.checked)} />I approve coding for this ticket in its prepared workspace.</label>
      <label><input type="checkbox" checked={allowance} disabled={busy||disabled} onChange={event=>setAllowance(event.target.checked)} />I understand this uses Codex allowance, including work already sent before cancellation.</label>
      <label><input type="checkbox" checked={checks} disabled={busy||disabled} onChange={event=>setChecks(event.target.checked)} />Allow project checks in this coding run. Otherwise report checks as not run.</label>
      <button disabled={busy||disabled||!scope||!allowance||state.canResume&&revisionPreview!==JSON.stringify({feedback,scope:state.requirementsToken,head:state.linkedHeadSha,checks})} onClick={()=>void act(state.canStart?'start':'resume')}>{state.canStart?'Start coding ticket':'Resume this ticket explicitly'}</button>
    </div>}
    {!state?.run?<p>No coding run has started for this ticket.</p>:<>
      <p role="status"><strong>{state.run.stage.replaceAll('_',' ')}</strong> / {state.run.message}</p>
      <p>Run <code>{state.run.id}</code> / updated {new Date(state.run.updatedAt).toLocaleString()}</p>
      {['starting','coding','permission','cancelling'].includes(state.run.stage)&&<button disabled={busy||state.run.stage==='cancelling'} onClick={()=>void act('cancel')}>Stop coding run</button>}
      {state.run.stage==='uncertain'&&<><p>Previous process: {state.run.processId??'unknown'}. The app will not kill or reattach an unknown process.</p><button disabled={busy||disabled} onClick={()=>void act('recover')}>Check previous process</button></>}
      {state.run.summary&&<details><summary>Developer statement</summary><pre>{state.run.summary}</pre><p>This is the coding model's statement, not independent verification.</p></details>}
      {state.run.commands.length>0&&<details><summary>Runtime command evidence ({state.run.commands.length})</summary>
        <p>Reported by the coding runtime, not inferred from the model's summary.</p>
        {state.run.commands.map((command,index)=><div key={index}><code>{command.command}</code><p>Exit: {command.exitCode??'unknown'}</p><pre>{command.output}</pre></div>)}
      </details>}
      <details><summary>Run activity</summary>{state.run.events.map((event,index)=><p key={index}>{new Date(event.at).toLocaleTimeString()} / {event.text}</p>)}</details>
      <details><summary>Saved runs and revision history ({state.history.length})</summary>
        <p>Earlier summaries and feedback remain attached to their original run and commit. Recovery starts a fresh context only after an explicit action.</p>
        {state.history.map(old=><article key={old.id}><p><code>{old.id}</code> / {old.stage} / {new Date(old.updatedAt).toLocaleString()}</p>
          {old.headSha&&<p>Result head: <code>{old.headSha}</code></p>}{old.feedbackHeadSha&&<p>Feedback on head: <code>{old.feedbackHeadSha}</code></p>}{old.feedback&&<pre>{old.feedback}</pre>}{old.summary&&<pre>{old.summary}</pre>}</article>)}
      </details>
      <CodingDeliveryPanel ticketId={ticketId} disabled={busy||disabled} canPreview={['ready','review','interrupted'].includes(state.run.stage)} onChanged={onChanged} />
    </>}
    {state?.pullNumber&&<CodingReviewPanel ticketId={ticketId} disabled={busy||disabled} onChanged={onChanged} />}
  </section>;
}
