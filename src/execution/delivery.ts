import {createHash} from 'node:crypto';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {isAbsolute,relative,resolve} from 'node:path';
import type {CodingProvider,DeliveryFile,DeliveryPreview,DeliveryState,CodingDelivery,RemoteCodingPull} from '../shared/delivery.ts';
import {executionRecord} from '../shared/execution.ts';
import type {ProjectRepository} from '../projects/repository.ts';
import type {ProjectTransaction} from '../projects/service.ts';
import type {LinkedWorkRepository} from '../sync/repository.ts';
import type {ExecutionRepository} from './repository.ts';
import {activeCodingStage} from '../shared/coding.ts';
import {codingScope} from './scope.ts';
import {git,ExecutionFailure} from './git.ts';

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const marker=(id:string)=>'<!-- focusflow-code:'+id+' -->';
const forbidden=/(^|\/)(?:\.git|\.codex|\.aws|\.phase0|node_modules|dist|release|artifacts|coverage|\.env(?:\.[^/]*)?|\.npmrc|auth\.json|config\.local\.[^/]*|id_rsa)(?:\/|$)|\.(?:db(?:-[a-z]+)?|sqlite(?:-[a-z]+)?|pem|key|log)$/i;
export function createDeliveryService(repository:ExecutionRepository,projects:ProjectRepository,linked:LinkedWorkRepository,
  transaction:ProjectTransaction,provider?:CodingProvider){
  const busy=new Set<string>();let closing=false;
  const pending=new Set<Promise<unknown>>();
  function context(id:string){
    const ticket=projects.findTicket(id),workspace=repository.workspace(id),run=repository.latestRun(id);
    if(!ticket?.coding?.repository||!ticket.coding.issueNumber||!workspace||!run)throw new ExecutionFailure('NOT_READY','Prepare and finish a published coding ticket first.');
    return {ticket,workspace,run,repository:ticket.coding.repository,issue:ticket.coding.issueNumber};
  }
  function state(id:string,preview:DeliveryPreview|null=null):DeliveryState {if(!projects.findTicket(id)?.coding?.issueNumber)throw new ExecutionFailure('NOT_PUBLISHED','Choose a published coding ticket.');return {ticketId:id,delivery:repository.delivery(id),preview,busy:busy.has(id)};}
  async function snapshot(id:string){
    const c=context(id);if(!['ready','review','interrupted'].includes(c.run.stage))throw new ExecutionFailure('RUN_ACTIVE','Stop or finish the coding run before previewing publication.');
    if(!c.run.requirementsToken||c.run.requirementsToken!==codingScope(c.ticket,projects.listDependencies(c.ticket.projectId),c.workspace))throw new ExecutionFailure('SCOPE_CHANGED','Requirements changed. Explicitly resume and review the new scope before publication.');
    const root=await realpath(c.workspace.workspacePath);
    if(await git(root,['branch','--show-current'])!==c.workspace.branch)throw new ExecutionFailure('BRANCH_CHANGED','The worktree branch changed. Nothing was published.');
    const changed=(await git(root,['diff','--name-only','-z','--no-renames',c.workspace.baseSha],undefined,false)).split('\0').filter(Boolean);
    const untracked=(await git(root,['ls-files','--others','--exclude-standard','-z'],undefined,false)).split('\0').filter(Boolean);
    const paths=[...new Set([...changed,...untracked])].sort();
    if(paths.length===0||paths.length>100)throw new ExecutionFailure('CHANGE_LIMIT','Publication requires 1 to 100 changed source files.');
    const modes=new Map((await git(root,['ls-files','--stage','-z'],undefined,false)).split('\0').filter(Boolean).map(line=>{
      const match=/^(\d+) [a-f0-9]+ \d\t([\s\S]+)$/.exec(line);return [match?.[2]??'',match?.[1]??''] as const;
    }));
    let total=0;const files:DeliveryFile[]=[],payload:{path:string;mode:'100644'|'100755';content:string|null}[]=[];
    for(const path of paths){
      if(isAbsolute(path)||path.includes('\\')||path.split('/').some(p=>!p||p==='.'||p==='..'||p.trim()!==p)||forbidden.test(path))throw new ExecutionFailure('PRIVATE_PATH','A generated, credential or private-data path is in the change. Remove it from the coding worktree before publication.');
      const mode=modes.get(path)??'100644';if(!['100644','100755'].includes(mode))throw new ExecutionFailure('UNSUPPORTED_FILE','Symlinks, submodules and unresolved index entries cannot be published by this workflow.');
      const full=resolve(root,path),info=await lstat(full).catch(error=>{if(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT')return null;throw error;});
      if(!info){files.push({path,deleted:true,binary:false,size:0,sha256:hash(null),mode:mode as '100644'|'100755'});payload.push({path,mode:mode as '100644'|'100755',content:null});continue;}
      if(!info.isFile()||info.isSymbolicLink())throw new ExecutionFailure('UNSUPPORTED_FILE','Only regular source files can be published.');
      const actual=await realpath(full),rel=relative(root,actual);if(isAbsolute(rel)||rel==='..'||rel.startsWith('..\\')||rel.startsWith('../'))throw new ExecutionFailure('OUTSIDE_WORKSPACE','A changed file resolves outside the owned worktree.');
      if(info.size>2097152||(total+=info.size)>4194304)throw new ExecutionFailure('CONTENT_LIMIT','The selected changes exceed the local publication size limit.');
      const data=await readFile(full),text=data.toString('utf8'),binary=data.includes(0)||!Buffer.from(text,'utf8').equals(data);
      if(!binary&&/(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|github_pat_[A-Za-z0-9_]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|sk-(?:proj-)?[A-Za-z0-9_-]{30,})/.test(text))throw new ExecutionFailure('POSSIBLE_SECRET','A possible credential was found in a changed file. Inspect and remove it before publication.');
      files.push({path,deleted:false,binary,size:data.length,sha256:createHash('sha256').update(data).digest('hex'),mode:mode as '100644'|'100755'});
      payload.push({path,mode:mode as '100644'|'100755',content:data.toString('base64')});
    }
    const preview:DeliveryPreview={ticketId:id,runId:c.run.id,repository:c.repository,branch:c.workspace.branch,baseSha:c.workspace.baseSha,files,
      pullNumber:repository.delivery(id)?.pullNumber??linked.read(id).pullNumber,token:hash({run:c.run.id,scope:c.run.requirementsToken,repository:c.repository,branch:c.workspace.branch,base:c.workspace.baseSha,files})};
    return {context:c,preview,payload};
  }
  function retainPull(id:string,pull:RemoteCodingPull,delivery:CodingDelivery){
    const c=context(id);
    if(pull.headRef!==delivery.branch||!pull.body.includes(marker(id))||!new RegExp('Closes\\s+#'+c.issue+'\\b','i').test(pull.body))throw new ExecutionFailure('PR_CONFLICT','The PR does not match this ticket and recovery marker.');
    if(!delivery.commitSha||pull.headSha!==delivery.commitSha)throw new ExecutionFailure('HEAD_CHANGED','The remote PR has changes outside the recorded publication. Its identity is retained, but those changes are not silently replaced or adopted.');
    transaction(now=>{
      repository.saveDelivery({...delivery,pullNumber:pull.number,commitSha:pull.headSha,stage:'published',updatedAt:now.toISOString(),message:'The linked PR is ready for owner review. No merge was performed.'});
      linked.linkPull(id,pull);projects.setStatus(id,'review',now.toISOString());
      repository.saveRun({...c.run,stage:'review',headSha:pull.headSha,updatedAt:now.toISOString(),message:'PR linked. Review the actual diff and current head before deciding to merge.'});
    });
  }
  async function publish(id:string,input:unknown){
    if(closing||busy.has(id)||repository.runs().some(r=>activeCodingStage(r.stage)))throw new ExecutionFailure('BUSY','Finish the active or uncertain operation before publication.');
    const request=executionRecord(input);if(request.confirm!==true)throw new ExecutionFailure('CONFIRM_REQUIRED','Confirm the exact repository, visibility and changed files before publishing.');
    if(!provider)throw new ExecutionFailure('GITHUB_REQUIRED','Connect GitHub with the required repository permissions.');
    busy.add(id);
    let attempted=false;
    try{
      const prepared=await snapshot(id),c=prepared.context;
      if(request.token!==prepared.preview.token)throw new ExecutionFailure('STALE_PREVIEW','Files or requirements changed. Preview publication again.');
      const previous=repository.delivery(id);
      if(previous&&['uncertain','creating-pr','committing'].includes(previous.stage))throw new ExecutionFailure('RECONCILE_REQUIRED','Inspect the previous publication result before another write.');
      if(previous?.digest===prepared.preview.token&&previous.stage==='published')return state(id);
      const live=await provider.inspect(c.ticket.projectId);if(JSON.stringify(live)!==JSON.stringify(c.repository))throw new ExecutionFailure('REPOSITORY_CHANGED','Repository identity or visibility changed.');
      const oldHead=await provider.branch(c.ticket.projectId,c.repository,c.workspace.branch);
      if(oldHead!==null&&oldHead!==previous?.commitSha)throw new ExecutionFailure('REMOTE_CHANGED','The remote coding branch has another head. Inspect it rather than overwriting it.');
      let delivery:CodingDelivery={ticketId:id,branch:c.workspace.branch,baseSha:c.workspace.baseSha,commitSha:null,previousSha:oldHead,
        pullNumber:previous?.pullNumber??null,digest:prepared.preview.token,stage:'committing',message:'Preparing the approved source snapshot.',updatedAt:new Date().toISOString()};
      transaction(()=>{
        if(repository.runs().some(r=>activeCodingStage(r.stage))||repository.latestRun(id)?.id!==c.run.id)throw new ExecutionFailure('BUSY','A coding run started after this preview. Nothing was published.');
        if(c.run.requirementsToken!==codingScope(c.ticket,projects.listDependencies(c.ticket.projectId),c.workspace))throw new ExecutionFailure('SCOPE_CHANGED','Requirements changed after preview.');
        repository.saveDelivery(delivery);repository.saveRun({...c.run,stage:'publishing',message:'Publishing the explicitly approved snapshot.',updatedAt:new Date().toISOString()});attempted=true;
      });
      const tree=await provider.baseTree(c.ticket.projectId,c.repository,c.workspace.baseSha);
      const commit=await provider.commit(c.ticket.projectId,c.repository,oldHead??c.workspace.baseSha,tree,prepared.payload,'['+c.issue+'] '+c.ticket.title);
      delivery={...delivery,commitSha:commit};repository.saveDelivery(delivery);
      await provider.writeBranch(c.ticket.projectId,c.repository,c.workspace.branch,commit,oldHead!==null);
      const matches=await provider.findPulls(c.ticket.projectId,c.repository,c.workspace.branch,marker(id));
      if(matches.length>1)throw new ExecutionFailure('PR_CONFLICT','More than one PR has this ticket marker. Reconcile manually.');
      let pull=matches[0];
      if(!pull){
        if(delivery.pullNumber)throw new ExecutionFailure('PR_MISSING','The known PR identity was not found. No replacement PR was created.');
        delivery={...delivery,stage:'creating-pr',message:'PR creation requested. A lost response requires reconciliation, not another creation.'};repository.saveDelivery(delivery);
        const evidence=c.run.commands.length?c.run.commands.map((x,index)=>'- Runtime-reported command '+(index+1)+': exit '+(x.exitCode??'unknown')+'.').join('\n')+'\nExact commands and output remain in the local profile; these results are not independent verification.':'Checks were not run. The owner will test locally.';
        pull=await provider.createPull(c.ticket.projectId,c.repository,c.workspace.branch,'['+c.issue+'] '+c.ticket.title,
          'Closes #'+c.issue+'\n\n## What changed\n\n'+c.ticket.description+'\n\n## How to check\n\n'+c.ticket.acceptanceCriteria+'\n\n## Check evidence\n\n'+evidence+'\n\nDeveloper statements are not independent verification. Review the exact current head and diff.\n\n'+marker(id));
      }
      if(pull.state!=='open'||pull.merged)throw new ExecutionFailure('PR_CLOSED','The existing PR is closed. No replacement was created.');
      if(pull.headSha!==commit)throw new ExecutionFailure('HEAD_CHANGED','The PR head changed during publication. Refresh its actual evidence.');
      retainPull(id,pull,delivery);return state(id);
    }catch(error){
      const delivery=repository.delivery(id),run=repository.latestRun(id);
      if(attempted&&delivery&&delivery.stage!=='published'){
        repository.saveDelivery({...delivery,stage:delivery.stage==='creating-pr'?'uncertain':delivery.stage,message:'Publication stopped. Inspect remote progress before any retry.',updatedAt:new Date().toISOString()});
        if(run)repository.saveRun({...run,stage:'uncertain',errorCode:'PUBLICATION_UNCERTAIN',message:'Remote progress must be reconciled before resuming.',updatedAt:new Date().toISOString()});
      }
      throw error instanceof ExecutionFailure?error:new ExecutionFailure('PUBLICATION_FAILED','GitHub publication could not be confirmed. Existing work and any remote artifacts are retained.');
    }finally{busy.delete(id);}
  }
  async function reconcile(id:string){
    if(busy.has(id)||closing)throw new ExecutionFailure('BUSY','Publication is already running.');
    const c=context(id),delivery=repository.delivery(id);if(!provider||!delivery)throw new ExecutionFailure('NO_DELIVERY','No saved publication to inspect.');
    busy.add(id);try{
      const matches=await provider.findPulls(c.ticket.projectId,c.repository,delivery.branch,marker(id));
      if(matches.length===1){retainPull(id,matches[0]!,delivery);return state(id);}
      if(matches.length>1||delivery.stage==='uncertain'||delivery.stage==='creating-pr')throw new ExecutionFailure('PR_UNCERTAIN','The PR result is missing or ambiguous. Inspect GitHub manually; creating another PR is blocked.');
      const head=await provider.branch(c.ticket.projectId,c.repository,delivery.branch);
      if(head!==delivery.commitSha&&head!==delivery.previousSha)throw new ExecutionFailure('REMOTE_CHANGED','The remote branch differs from the recorded publication.');
      repository.saveDelivery({...delivery,stage:'conflict',message:'No PR was requested. The branch result is retained; explicit publication can safely inspect and continue it.',updatedAt:new Date().toISOString()});
      repository.saveRun({...c.run,stage:'ready',message:'No PR creation was requested; preview before explicitly retrying publication.',updatedAt:new Date().toISOString()});
      return state(id);
    }finally{busy.delete(id);}
  }
  function owned<T>(work:Promise<T>):Promise<T>{pending.add(work);void work.finally(()=>pending.delete(work)).catch(()=>{});return work;}
  return {state,preview:async(id:string)=>{const value=await snapshot(id);return state(id,value.preview);},
    publish:(id:string,input:unknown)=>owned(publish(id,input)),reconcile:(id:string)=>owned(reconcile(id)),
    async close(){closing=true;await Promise.allSettled([...pending]);}};
}
export type DeliveryService=ReturnType<typeof createDeliveryService>;
