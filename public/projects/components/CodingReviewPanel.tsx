import { t } from '../../workspace/locale.ts';
import { ModelPicker } from './ModelPicker.tsx';
import { defaultAiModelSelection } from '../../../src/shared/ai.ts';
import { projectSettings } from '../../../src/client/project-settings.ts';
import {useEffect,useRef,useState} from 'react';
import type {ReviewState} from '../../../src/shared/review.ts';
import {createReviewClient} from '../../../src/client/review.ts';
const api=createReviewClient();
export function CodingReviewPanel({ticketId,projectId,disabled,onChanged}:{ticketId:string;projectId:string;disabled:boolean;onChanged():void}){
  const[state,setState]=useState<ReviewState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  // Refresh failures clear after the next successful read; action errors stay until the next action.
  const[readError,setReadError]=useState('');
  const[question,setQuestion]=useState(''),[allowance,setAllowance]=useState(false),[confirm,setConfirm]=useState(false),[unverified,setUnverified]=useState(false),[closeIssue,setCloseIssue]=useState(false);
  const [selection, setSelection] = useState(defaultAiModelSelection);
  const [picker, setPicker] = useState(false);
  useEffect(() => {
    let current = true;
    void projectSettings(projectId).then(value => { if (current && value.review) setSelection(value.review); }).catch(() => {});
    return () => { current = false; };
  }, [projectId]);
  const generation=useRef(0),alive=useRef(true),owned=useRef(false);
  useEffect(()=>{alive.current=true;let reading=false,ticks=0;
    const read=async()=>{if(reading||owned.current)return;reading=true;const version=generation.current;
      try{const next=(++ticks%10===0)?await api.act(ticketId,'observe'):await api.read(ticketId);if(alive.current&&version===generation.current){setState(next);setReadError('');}}catch{if(alive.current)setReadError('Could not refresh review state. Saved evidence is retained.');}finally{reading=false;}};
    void read();const timer=setInterval(()=>{if(!document.hidden)void read();},2000);return()=>{alive.current=false;clearInterval(timer);generation.current++;};
  },[ticketId]);
  async function act(action:string,kind?:'summary'|'independent'|'question'){
    if(owned.current)return;owned.current=true;generation.current++;setBusy(true);setError('');
    try{const next=await api.act(ticketId,action,{kind,question,selection:selection.model ? selection : undefined,confirmAllowance:allowance,scope:state?.scope,headSha:state?.evidence?.pull.headSha,confirm:action==='close-issue'?closeIssue:confirm,confirmUnverified:unverified});
      if(alive.current){setState(next);setConfirm(false);setAllowance(false);setCloseIssue(false);onChanged();}}
    catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'The review action failed.');}
    finally{owned.current=false;if(alive.current)setBusy(false);}
  }
  const evidence=state?.evidence,head=evidence?.pull.headSha;
  return <section className="coding-review" aria-label={t("PR review")}><h3>{t("Understand and review this PR")}</h3>
    {error&&<p role="alert" className="error">{t(error)}</p>}{readError&&<p role="status" className="feedback">{readError}</p>}{state?.error&&<p role="alert" className="error">{state.error}</p>}
    <button disabled={busy||disabled} onClick={()=>void act('refresh')}>{t("Refresh PR evidence")}</button>{' '}
    <button disabled={busy||disabled} onClick={()=>void act('observe')}>{t("Check merge state")}</button>
    {state&&<p><a href={state.pullUrl} target="_blank" rel="noreferrer">{t("Open PR on GitHub to inspect or merge")}</a></p>}
    {state?.mergeNotice&&<p role="status">{state.mergeNotice}</p>}
    {state?.issue&&<p>{t("Linked Issue #")}{state.issue.number}: {state.issue.state}{t(". Issue closure alone never makes a coding ticket Done.")}</p>}
    {state?.issue?.state==='open'&&evidence?.pull.merged&&<div><label><input type="checkbox" checked={closeIssue} disabled={busy||disabled} onChange={event=>setCloseIssue(event.target.checked)} />{t("Close this linked Issue after the observed PR merge.")}</label><button disabled={busy||disabled||!closeIssue} onClick={()=>void act('close-issue')}>{t("Close linked Issue")}</button></div>}
    {!evidence?<p>{t("No saved PR evidence yet. Refresh reads GitHub without calling a model.")}</p>:<>
      <p>{t("PR #")}{evidence.pull.number} / {evidence.pull.merged?t('Merged'):evidence.pull.state} {t("/ head")} <code>{head}</code></p>
      <p>{t("Evidence read")} {new Date(evidence.fetchedAt).toLocaleString()}. {state?.stale?t('Stale head: refresh before asking or approving.'):t('Saved evidence is tied to this commit.')}</p>
      <p><strong>{t("Code observations:")}</strong> {evidence.files.length} {t("files, +")}{evidence.files.reduce((n,f)=>n+f.additions,0)} / -{evidence.files.reduce((n,f)=>n+f.deletions,0)} {t("lines.")} {evidence.filesComplete?t('Inline diff is available.'):'Some diff/source content is omitted or incomplete; no complete-code claim is made.'}</p>
      <p><strong>{t("Recorded checks:")}</strong> {evidence.checksAvailable&&evidence.checksComplete&&evidence.checks.length?evidence.checks.length+t(' check records below.'):t('Missing, incomplete or not run. This is not a passing verification.')}</p>
      <details><summary>{t("Actual changed files and diff")}</summary>{evidence.files.map(file=><article key={file.path}><h4>{file.path}</h4><p>{file.status} / +{file.additions} / -{file.deletions} / {file.complete?t('Diff available'):t('Incomplete or omitted')}</p><pre>{file.patch??t('No inline patch is available.')}</pre></article>)}</details>
      <details><summary>{t("Dependency/import edits")}</summary>{evidence.files.flatMap(file=>(file.patch??'').split('\n').filter(line=>/^[+-].*(?:import |require\(|from |dependencies|devDependencies)/.test(line)).slice(0,20).map((line,index)=><p key={file.path+index}><code>{file.path}: {line}</code></p>))}</details>
      <details><summary>{t("GitHub check sources")}</summary>{evidence.checks.map((check,index)=><p key={index}>{check.name}: {check.conclusion??check.status} / {check.source} {check.url&&<a href={check.url} target="_blank" rel="noreferrer">{t("Open check")}</a>}</p>)}</details>
      <button type="button" onClick={() => setPicker(value => !value)}>{t("Review model and effort")}</button>
      {picker && <ModelPicker value={selection} onChange={setSelection} disabled={busy || disabled} />}
      <div><label><input type="checkbox" checked={allowance} disabled={busy||disabled||state?.busy} onChange={event=>setAllowance(event.target.checked)} />{t("Use the selected AI allowance for one read-only answer using this PR's requirements, diff and bounded source excerpts.")}</label>
        <button disabled={busy||disabled||state?.busy||state?.stale||!allowance} onClick={()=>void act('ask','summary')}>{t("Explain this change")}</button>{' '}
        <button disabled={busy||disabled||state?.busy||state?.stale||!allowance} onClick={()=>void act('ask','independent')}>{t("Run a separate AI review")}</button>
        <label>{t("Question about this code or library")}<textarea value={question} maxLength={4000} disabled={busy||disabled} onChange={event=>setQuestion(event.target.value)} /></label>
        <button disabled={busy||disabled||state?.busy||state?.stale||!allowance||!question.trim()} onClick={()=>void act('ask','question')}>{t("Ask about this PR")}</button>
        {state?.busy&&<><p role="status">{t("Read-only AI request in progress. It does not edit code or merge.")}</p><button disabled={busy} onClick={()=>void act('cancel')}>{t("Cancel AI review")}</button></>}
      </div>
      {state?.answers.map(answer=><details key={answer.id} open={answer.id===state.answers.at(-1)?.id}><summary>{answer.kind} / {answer.headSha===head&&answer.scope===state.scope?t('This head and requirements'):t('Stale head or requirements')}</summary>
        {answer.question&&<p>{answer.question}</p>}<pre>{answer.text}</pre><p>{t("AI inference from attached evidence; not independent human verification. Head:")} <code>{answer.headSha}</code></p>
        {answer.evidenceAt&&<p>{t("Check/code evidence read:")} {new Date(answer.evidenceAt).toLocaleString()}{t(". A later check result at the same head can differ.")}</p>}</details>)}
      <div><label><input type="checkbox" checked={confirm} disabled={busy||disabled||state?.stale} onChange={event=>setConfirm(event.target.checked)} />{t("Record my local review decision for this exact head and requirements.")}</label>
        <label><input type="checkbox" checked={unverified} disabled={busy||disabled} onChange={event=>setUnverified(event.target.checked)} />{t("I acknowledge any missing checks, incomplete source or missing separate review.")}</label>
        <button disabled={busy||disabled||state?.busy||state?.stale||!confirm} onClick={()=>void act('approve')}>{t("Record approval for this head")}</button>
        <p>{state?.approved?t('A matching local approval is recorded. Merge remains your explicit action on GitHub.'):t('No current matching local approval. New commits or changed requirements invalidate earlier decisions.')}</p>
      </div>
    </>}
  </section>;
}
