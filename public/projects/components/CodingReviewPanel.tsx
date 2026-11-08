import {useEffect,useRef,useState} from 'react';
import type {ReviewState} from '../../../src/shared/review.ts';
import {createReviewClient} from '../../../src/client/review.ts';
const api=createReviewClient();
export function CodingReviewPanel({ticketId,disabled,onChanged}:{ticketId:string;disabled:boolean;onChanged():void}){
  const[state,setState]=useState<ReviewState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const[question,setQuestion]=useState(''),[allowance,setAllowance]=useState(false),[confirm,setConfirm]=useState(false),[unverified,setUnverified]=useState(false),[closeIssue,setCloseIssue]=useState(false);
  const generation=useRef(0),alive=useRef(true),owned=useRef(false);
  useEffect(()=>{alive.current=true;let reading=false,ticks=0;
    const read=async()=>{if(reading||owned.current)return;reading=true;const version=generation.current;
      try{const next=(++ticks%10===0)?await api.act(ticketId,'observe'):await api.read(ticketId);if(alive.current&&version===generation.current)setState(next);}catch{if(alive.current)setError('Could not refresh review state. Saved evidence is retained.');}finally{reading=false;}};
    void read();const timer=setInterval(()=>void read(),2000);return()=>{alive.current=false;clearInterval(timer);generation.current++;};
  },[ticketId]);
  async function act(action:string,kind?:'summary'|'independent'|'question'){
    if(owned.current)return;owned.current=true;generation.current++;setBusy(true);setError('');
    try{const next=await api.act(ticketId,action,{kind,question,confirmAllowance:allowance,scope:state?.scope,headSha:state?.evidence?.pull.headSha,confirm:action==='close-issue'?closeIssue:confirm,confirmUnverified:unverified});
      if(alive.current){setState(next);setConfirm(false);setAllowance(false);setCloseIssue(false);onChanged();}}
    catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'The review action failed.');}
    finally{owned.current=false;if(alive.current)setBusy(false);}
  }
  const evidence=state?.evidence,head=evidence?.pull.headSha;
  return <section className="coding-review" aria-label="PR review"><h3>Understand and review this PR</h3>
    {error&&<p role="alert">{error}</p>}{state?.error&&<p role="alert">{state.error}</p>}
    <button disabled={busy||disabled} onClick={()=>void act('refresh')}>Refresh PR evidence</button>{' '}
    <button disabled={busy||disabled} onClick={()=>void act('observe')}>Check merge state</button>
    {state&&<p><a href={state.pullUrl} target="_blank" rel="noreferrer">Open PR on GitHub to inspect or merge</a></p>}
    {state?.mergeNotice&&<p role="status">{state.mergeNotice}</p>}
    {state?.issue&&<p>Linked Issue #{state.issue.number}: {state.issue.state}. Issue closure alone never makes a coding ticket Done.</p>}
    {state?.issue?.state==='open'&&evidence?.pull.merged&&<div><label><input type="checkbox" checked={closeIssue} disabled={busy||disabled} onChange={event=>setCloseIssue(event.target.checked)} />Close this linked Issue after the observed PR merge.</label><button disabled={busy||disabled||!closeIssue} onClick={()=>void act('close-issue')}>Close linked Issue</button></div>}
    {!evidence?<p>No saved PR evidence yet. Refresh reads GitHub without calling a model.</p>:<>
      <p>PR #{evidence.pull.number} / {evidence.pull.merged?'Merged':evidence.pull.state} / head <code>{head}</code></p>
      <p>Evidence read {new Date(evidence.fetchedAt).toLocaleString()}. {state?.stale?'Stale head: refresh before asking or approving.':'Saved evidence is tied to this commit.'}</p>
      <p><strong>Code observations:</strong> {evidence.files.length} files, +{evidence.files.reduce((n,f)=>n+f.additions,0)} / -{evidence.files.reduce((n,f)=>n+f.deletions,0)} lines. {evidence.filesComplete?'Inline diff is available.':'Some diff/source content is omitted or incomplete; no complete-code claim is made.'}</p>
      <p><strong>Recorded checks:</strong> {evidence.checksAvailable&&evidence.checksComplete&&evidence.checks.length?evidence.checks.length+' check records below.':'Missing, incomplete or not run. This is not a passing verification.'}</p>
      <details><summary>Actual changed files and diff</summary>{evidence.files.map(file=><article key={file.path}><h4>{file.path}</h4><p>{file.status} / +{file.additions} / -{file.deletions} / {file.complete?'Diff available':'Incomplete or omitted'}</p><pre>{file.patch??'No inline patch is available.'}</pre></article>)}</details>
      <details><summary>Dependency/import edits</summary>{evidence.files.flatMap(file=>(file.patch??'').split('\n').filter(line=>/^[+-].*(?:import |require\(|from |dependencies|devDependencies)/.test(line)).slice(0,20).map((line,index)=><p key={file.path+index}><code>{file.path}: {line}</code></p>))}</details>
      <details><summary>GitHub check sources</summary>{evidence.checks.map((check,index)=><p key={index}>{check.name}: {check.conclusion??check.status} / {check.source} {check.url&&<a href={check.url} target="_blank" rel="noreferrer">Open check</a>}</p>)}</details>
      <div><label><input type="checkbox" checked={allowance} disabled={busy||disabled||state?.busy} onChange={event=>setAllowance(event.target.checked)} />Use ChatGPT Codex allowance for one read-only answer using this PR's requirements, diff and bounded source excerpts.</label>
        <button disabled={busy||disabled||state?.busy||state?.stale||!allowance} onClick={()=>void act('ask','summary')}>Explain this change</button>{' '}
        <button disabled={busy||disabled||state?.busy||state?.stale||!allowance} onClick={()=>void act('ask','independent')}>Run a separate AI review</button>
        <label>Question about this code or library<textarea value={question} maxLength={4000} disabled={busy||disabled} onChange={event=>setQuestion(event.target.value)} /></label>
        <button disabled={busy||disabled||state?.busy||state?.stale||!allowance||!question.trim()} onClick={()=>void act('ask','question')}>Ask about this PR</button>
        {state?.busy&&<><p role="status">Read-only AI request in progress. It does not edit code or merge.</p><button disabled={busy} onClick={()=>void act('cancel')}>Cancel AI review</button></>}
      </div>
      {state?.answers.map(answer=><details key={answer.id} open={answer.id===state.answers.at(-1)?.id}><summary>{answer.kind} / {answer.headSha===head&&answer.scope===state.scope?'This head and requirements':'Stale head or requirements'}</summary>
        {answer.question&&<p>{answer.question}</p>}<pre>{answer.text}</pre><p>AI inference from attached evidence; not independent human verification. Head: <code>{answer.headSha}</code></p></details>)}
      <div><label><input type="checkbox" checked={confirm} disabled={busy||disabled||state?.stale} onChange={event=>setConfirm(event.target.checked)} />Record my local review decision for this exact head and requirements.</label>
        <label><input type="checkbox" checked={unverified} disabled={busy||disabled} onChange={event=>setUnverified(event.target.checked)} />I acknowledge any missing checks, incomplete source or missing separate review.</label>
        <button disabled={busy||disabled||state?.busy||state?.stale||!confirm} onClick={()=>void act('approve')}>Record approval for this head</button>
        <p>{state?.approved?'A matching local approval is recorded. Merge remains your explicit action on GitHub.':'No current matching local approval. New commits or changed requirements invalidate earlier decisions.'}</p>
      </div>
    </>}
  </section>;
}
