import { PreviewPanel } from './PreviewPanel.tsx';
import { projectSettings } from '../../../src/client/project-settings.ts';
import { ModelPicker } from './ModelPicker.tsx';
import { defaultAiModelSelection } from '../../../src/shared/ai.ts';
import {useEffect,useState,useRef} from 'react';
import type {CodingState} from '../../../src/shared/coding.ts';
import {createRunClient} from '../../../src/client/coding.ts';
import {CodingDeliveryPanel} from './CodingDeliveryPanel.tsx';
import {CodingReviewPanel} from './CodingReviewPanel.tsx';

const api=createRunClient();
export function CodingRunPanel({ticketId,projectId,disabled,onChanged}:{ticketId:string;projectId:string;disabled:boolean;onChanged():void}){
  const[state,setState]=useState<CodingState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  // Refresh failures are separate from action errors and clear after the next successful read.
  const[readError,setReadError]=useState('');
  const [selection,setSelection]=useState(defaultAiModelSelection);
  const [files,setFiles]=useState('');
  const [picker,setPicker]=useState(false);
  const[checks,setChecks]=useState(false),[feedback,setFeedback]=useState('');
  const[revisionPreview,setRevisionPreview]=useState<string|null>(null);
  useEffect(() => {
    let current = true;
    void projectSettings(projectId).then(value => { if (current && value.execution) setSelection(value.execution); }).catch(() => {});
    return () => { current = false; };
  }, [projectId]);
  const sequence=useRef(0),alive=useRef(true),requestBusy=useRef(false);
  useEffect(()=>{alive.current=true;let reading=false;
    const read=async()=>{if(reading||requestBusy.current)return;reading=true;const version=sequence.current;
      try{const next=await api.read(ticketId);if(alive.current&&version===sequence.current){setState(next);setReadError('');}}catch{if(alive.current)setReadError('Could not refresh the saved coding run. Retrying.');}finally{reading=false;}};
    void read();const timer=setInterval(()=>{if(!document.hidden)void read();},2000);return()=>{alive.current=false;clearInterval(timer);sequence.current++;};
  },[ticketId]);
  async function act(action:string){if(requestBusy.current)return;requestBusy.current=true;sequence.current++;setBusy(true);setError('');
    try{const next=await api.act(ticketId,action,{confirm:true,runId:state?.run?.id,confirmScope:true,confirmAllowance:true,selection,files,requirementsToken:state?.requirementsToken,feedback,allowChecks:checks,headSha:state?.linkedHeadSha});if(alive.current){setState(next);setRevisionPreview(null);onChanged();}}
    catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'The coding action failed.');}
    finally{requestBusy.current=false;if(alive.current)setBusy(false);}
  }
  return <section className="coding-run" aria-label="Coding run"><h3>Execute with AI</h3>
    {error&&<p role="alert" className="error">{error}</p>}{readError&&<p role="status" className="feedback">{readError}</p>}
    {state?.externalPull&&<p>This PR was linked for review only. This worktree cannot publish or revise it; no replacement PR will be created.</p>}
    {state?.activeTicketId&&state.activeTicketId!==ticketId&&<p>Another coding task is active or uncertain. Open it from Action center before starting more work.</p>}
    {state&&(state.canStart||state.canResume)&&<div>
      <p>Run in the prepared ticket worktree using {selection.provider !== 'codex' ? 'the selected API balance' : 'ChatGPT Codex allowance'}.</p>
      <button type="button" onClick={() => setPicker(value => !value)}>{picker ? 'Hide model options' : 'Choose model and effort'}</button>
      {picker && <ModelPicker value={selection} onChange={setSelection} disabled={busy || disabled} />}
      {selection.provider !== 'codex' && <label>Tracked files this model can edit<textarea value={files} maxLength={6000} onChange={event => setFiles(event.target.value)} placeholder="One relative path per line" /></label>}
      {state.canResume&&<><label>Revision or recovery instructions<textarea value={feedback} maxLength={8000} disabled={busy||disabled} onChange={event=>{setFeedback(event.target.value);setRevisionPreview(null);}} /></label>
        <button disabled={busy||disabled} onClick={()=>setRevisionPreview(JSON.stringify({feedback,scope:state.requirementsToken,head:state.linkedHeadSha,checks}))}>Preview revision scope</button>
        {revisionPreview&&<div><p>Continue this same ticket and prepared worktree in a fresh coding context. {state.pullNumber?'Update existing PR #'+state.pullNumber:'Do not create another ticket.'}</p>
          {state.linkedHeadSha&&<p>Observed PR head: <code>{state.linkedHeadSha}</code></p>}<pre>{feedback||'Inspect and continue the retained work within the existing ticket requirements.'}</pre>
          <p>Project checks: {checks?'Allowed for this run':'Not requested'}. Earlier review evidence does not approve new commits.</p></div>}
      </>}
      <label><input type="checkbox" checked={checks} disabled={busy||disabled} onChange={event=>setChecks(event.target.checked)} />Allow project checks in this coding run. Otherwise report checks as not run.</label>
      <button disabled={busy||disabled||picker&&!selection.model||selection.provider!=='codex'&&!files.trim()||state.canResume&&revisionPreview!==JSON.stringify({feedback,scope:state.requirementsToken,head:state.linkedHeadSha,checks})} onClick={()=>void act(state.canStart?'start':'resume')}>{state.canStart?'Start coding ticket':'Resume this ticket explicitly'}</button>
    </div>}
    {!state?.run?<p>No coding run has started for this ticket.</p>:<>
      <p role="status"><strong>{state.run.stage.replaceAll('_',' ')}</strong> / {state.run.message}</p>
      <details><summary>Model and token usage</summary>
        <p>{state.run.selection?.provider ?? 'codex'} - {state.run.selection?.model || 'Provider default'} - {state.run.selection?.effort || 'Default effort'}</p>
        <p>Estimated initial input: {state.run.inputEstimate ?? 'Unavailable'}</p>
        {state.run.usage ? <p>{state.run.usage.input} input - {state.run.usage.output} output - {state.run.usage.cached} cached - {state.run.usage.reasoning} reasoning</p> : <p>Provider token usage unavailable.</p>}
      </details>
      {state.run.contextSnapshot && <details><summary>Run context snapshot</summary>
        <p>Project revision {state.run.contextSnapshot.projectRevision} - Base {state.run.contextSnapshot.baseSha.slice(0, 12)}</p>
        <pre>{state.run.contextSnapshot.prompt}</pre>
      </details>}
      <p>Run <code>{state.run.id}</code> / updated {new Date(state.run.updatedAt).toLocaleString()}</p>
      {state.run.stage === 'permission' && state.run.pendingPatch && <details open><summary>Review file changes before applying</summary>
        <pre>{state.run.pendingPatch.diff}</pre>
        <button className="primary" disabled={busy || disabled} onClick={() => void act('apply-patch')}>Apply this patch</button>
        <button disabled={busy || disabled} onClick={() => void act('cancel')}>Discard patch</button>
      </details>}
      {['starting','coding','permission','cancelling'].includes(state.run.stage)&&!(state.run.stage==='permission'&&state.run.pendingPatch)&&<button disabled={busy||state.run.stage==='cancelling'} onClick={()=>void act('cancel')}>Stop coding run</button>}
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
      {['ready','review','interrupted'].includes(state.run.stage) && <PreviewPanel ticketId={ticketId} />}
      <CodingDeliveryPanel ticketId={ticketId} disabled={busy||disabled} canPreview={['ready','review','interrupted'].includes(state.run.stage)} onChanged={onChanged} />
    </>}
    {state?.pullNumber&&<CodingReviewPanel ticketId={ticketId} projectId={projectId} disabled={busy||disabled} onChanged={onChanged} />}
  </section>;
}
