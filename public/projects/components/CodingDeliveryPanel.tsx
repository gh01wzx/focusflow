import { t } from '../../workspace/locale.ts';
import {useEffect,useState} from 'react';
import {createDeliveryClient} from '../../../src/client/delivery.ts';
import type {DeliveryState} from '../../../src/shared/delivery.ts';
const api=createDeliveryClient();
export function CodingDeliveryPanel({ticketId,disabled,canPreview,onChanged}:{ticketId:string;disabled:boolean;canPreview:boolean;onChanged():void}){
  const[state,setState]=useState<DeliveryState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(false);
  useEffect(()=>{let alive=true;void api.read(ticketId).then(s=>{if(alive)setState(s);},()=>{});return()=>{alive=false;};},[ticketId]);
  async function act(action:string){if(busy)return;setBusy(true);setError('');try{setState(await api.act(ticketId,action,{confirm,token:state?.preview?.token}));setConfirm(false);onChanged();}catch(cause){setError(cause instanceof Error?cause.message:'Could not publish this change.');}finally{setBusy(false);}}
  return <section aria-label={t("Coding PR publication")}><h3>{t("Publish this code for review")}</h3>
    {error&&<p role="alert">{t(error)}</p>}
    <button disabled={busy||disabled||!canPreview} onClick={()=>void act('preview')}>{t("Preview PR publication")}</button>
    {state?.delivery&&<><p>{state.delivery.stage}: {state.delivery.message}</p><button disabled={busy||disabled} onClick={()=>void act('reconcile')}>{t("Inspect saved publication progress")}</button></>}
    {state?.preview&&<div><p><strong>{state.preview.repository.fullName}</strong> / {state.preview.repository.private?t('Private'):t('Public')} {t("repository")}</p>
      <p>{t("Branch:")} <code>{state.preview.branch}</code> {t("/ base:")} <code>{state.preview.baseSha}</code></p>
      <ul>{state.preview.files.map(file=><li key={file.path}><code>{file.path}</code> / {file.deleted?t('Deleted'):file.binary?t('Binary file'):t('Source file')} / {file.size} {t("bytes")}</li>)}</ul>
      <p>{t("Only the displayed source snapshot, approved ticket text and brief command outcomes are published. Full local command output, personal tasks and credentials are excluded. Inspect the worktree before confirming; secret-pattern screening is not a guarantee.")}</p>
      <label><input type="checkbox" checked={confirm} disabled={busy||disabled} onChange={event=>setConfirm(event.target.checked)} />{t("I approve publishing these exact files and ticket details to this repository.")}</label>
      <button disabled={busy||disabled||!confirm} onClick={()=>void act('publish')}>{state.preview.pullNumber?t('Update the existing PR'):t('Publish branch and create PR')}</button>
    </div>}
  </section>;
}
