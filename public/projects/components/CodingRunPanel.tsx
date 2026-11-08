import {useEffect,useState,useRef} from 'react';
import type {CodingState} from '../../../src/shared/coding.ts';
import {createRunClient} from '../../../src/client/coding.ts';

const api=createRunClient();
export function CodingRunPanel({ticketId,disabled,onChanged}:{ticketId:string;disabled:boolean;onChanged():void}){
  const[state,setState]=useState<CodingState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const sequence=useRef(0),alive=useRef(true),requestBusy=useRef(false);
  useEffect(()=>{alive.current=true;let reading=false;
    const read=async()=>{if(reading||requestBusy.current)return;reading=true;const version=sequence.current;
      try{const next=await api.read(ticketId);if(alive.current&&version===sequence.current)setState(next);}catch{if(alive.current)setError('Could not refresh the saved coding run.');}finally{reading=false;}};
    void read();const timer=setInterval(()=>void read(),2000);return()=>{alive.current=false;clearInterval(timer);sequence.current++;};
  },[ticketId]);
  async function act(action:string){if(requestBusy.current)return;requestBusy.current=true;sequence.current++;setBusy(true);setError('');
    try{const next=await api.act(ticketId,action);if(alive.current){setState(next);onChanged();}}
    catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'The coding action failed.');}
    finally{requestBusy.current=false;if(alive.current)setBusy(false);}
  }
  return <section className="coding-run" aria-label="Coding run"><h3>Coding run</h3>
    {error&&<p role="alert">{error}</p>}
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
    </>}
  </section>;
}
