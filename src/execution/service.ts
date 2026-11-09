import { randomUUID } from 'node:crypto';
import {codingScope} from './scope.ts';
import { realpath } from 'node:fs/promises';
import type { ProjectRepository } from '../projects/repository.ts';
import type { ProjectTransaction } from '../projects/service.ts';
import type { AiService } from '../ai/service.ts';
import type { CodingRun,CodingState,CodingStage } from '../shared/coding.ts';
import { activeCodingStage } from '../shared/coding.ts';
import { executionRecord } from '../shared/execution.ts';
import { unfinishedPrerequisites } from '../shared/dependencies.ts';
import { issueFields } from '../shared/linked-work.ts';
import type { LinkedWorkProvider } from '../sync/service.ts';
import type { GitHubRepository } from '../shared/github.ts';
import type {LinkedWorkRepository} from '../sync/repository.ts';
import { codingTurn,CodingTurnFailure } from '../codex/coding-turn.ts';
import { CodexFailure } from '../codex/client.ts';
import { CodexProcessFailure } from '../codex/process.ts';
import { ProbeFailure } from '../codex/read-only-probe.ts';
import type { ExecutionRepository } from './repository.ts';
import type { ApprovalBroker } from './approvals.ts';
import { ExecutionFailure,git } from './git.ts';

export function processState(pid:number|null):'stopped'|'alive'|'unknown' {
  if(pid===null)return'stopped';
  try{process.kill(pid,0);return'alive';}catch(error){return error&&typeof error==='object'&&'code'in error&&error.code==='ESRCH'?'stopped':'unknown';}
}
function message(code:string):string {
  if(code==='AUTH_REQUIRED')return'Sign in with ChatGPT again before explicitly resuming this ticket.';
  if(code==='USAGE_LIMIT')return'The provider reported exhausted Codex allowance. Resume only after it resets.';
  if(code==='RATE_LIMITED')return'The provider reported a rate limit. Wait before explicitly resuming.';
  if(code==='CANCELLED')return'The owned coding process stopped. Earlier file changes remain in its worktree.';
  if(code==='CLI_MISSING'||code==='MISSING')return'The pinned AI runtime is missing. Close the app and use Start-FocusFlow.cmd to prepare it.';
  if(code==='BUSY')return'Another AI operation owns the runtime. Finish or cancel it before explicitly resuming.';
  if(code==='CONNECTION_FAILED'||code==='CONNECTION_CLOSED')return'The runtime connection ended. Check the network and inspect saved work before resuming.';
  if(code==='UNSUPPORTED_REQUEST'||code==='UNSUPPORTED_TOOL')return'Codex requested an unsupported interaction. No permission was granted; clarify the task before resuming.';
  return'The run did not complete. Inspect the retained workspace and recorded stage; the cause is not established.';
}
export function createCodingService(repository:ExecutionRepository,projects:ProjectRepository,transaction:ProjectTransaction,
  ai:AiService,approvals:ApprovalBroker,provider?:LinkedWorkProvider & {inspect(projectId:string):Promise<GitHubRepository>},linkedWork?:LinkedWorkRepository) {
  let active:{ticketId:string;runId:string;abort:AbortController;work:Promise<void>}|null=null,closing=false;
  function current(id:string){const ticket=projects.findTicket(id);if(!ticket?.coding?.repository||!ticket.coding.issueNumber||ticket.executionMode!=='codex')throw new ExecutionFailure('NOT_PUBLISHED','Choose a published coding ticket.');return ticket;}
  function eligible(id:string){const t=current(id);return t.status==='backlog'&&!t.blockReason&&unfinishedPrerequisites(id,projects.listTickets(t.projectId),projects.listDependencies(t.projectId)).length===0;}
  function unblocked(id:string){const t=current(id);return !t.blockReason&&unfinishedPrerequisites(id,projects.listTickets(t.projectId),projects.listDependencies(t.projectId)).length===0;}
  function token(id:string){const t=current(id);return codingScope(t,projects.listDependencies(t.projectId),repository.workspace(id));}
  function save(run:CodingRun,stage:CodingStage,text:string){const now=new Date().toISOString();repository.saveRun({...run,stage,updatedAt:now,message:text,events:[...run.events,{at:now,text}].slice(-200)});}
  function update(runId:string,ticketId:string,change:Partial<CodingRun>){const run=repository.latestRun(ticketId);if(run?.id===runId)repository.saveRun({...run,...change,updatedAt:new Date().toISOString()});}
  function lostRun(run:CodingRun){const alive=processState(run.processId);save(run,alive==='stopped'?'interrupted':'uncertain',
    alive==='stopped'?'The previous process is not running. Inspect saved work and explicitly resume in a new Codex context.'
      :'The previous process may still be running. Automatic reattachment or termination is not supported. Stop that process before recovery.');}
  for(const run of repository.runs())if(activeCodingStage(run.stage))lostRun(run);
  function state(id:string):CodingState {
    const t=current(id),run=repository.latestRun(id),owner=repository.runs().find(r=>activeCodingStage(r.stage));
    const delivery=repository.delivery(id),publicationPending=!!delivery&&['committing','creating-pr','uncertain'].includes(delivery.stage);
    const linked=linkedWork?.read(id),pullNumber=delivery?.pullNumber??linked?.pullNumber??null,linkedHeadSha=linked?.pull?.headSha??delivery?.commitSha??null;
    const remoteAligned=!delivery?.pullNumber||linkedHeadSha===delivery.commitSha;
    const externalPull=!!linked?.pullNumber&&linked.pullNumber!==delivery?.pullNumber;
    const history=repository.runs().filter(r=>r.ticketId===id).slice(-20).reverse().map(r=>({id:r.id,stage:r.stage,createdAt:r.createdAt,updatedAt:r.updatedAt,headSha:r.headSha,feedbackHeadSha:r.feedbackHeadSha??null,feedback:r.feedback,summary:r.summary.slice(0,4000)}));
    return {ticketId:id,run,activeTicketId:owner?.ticketId??null,requirementsToken:token(id),history,pullNumber,linkedHeadSha,externalPull,
      canStart:!closing&&!active&&!owner&&!ai.busy()&&!publicationPending&&!externalPull&&eligible(id)&&repository.workspace(id)?.state==='ready',
      canResume:!closing&&!active&&!owner&&!ai.busy()&&!publicationPending&&!externalPull&&remoteAligned&&!!run&&['failed','stopped','interrupted','ready','review'].includes(run.stage)&&t.status!=='done'&&unblocked(id)&&repository.workspace(id)?.state==='ready'};
  }
  async function perform(id:string,runId:string,abort:AbortController,prompt:string,expected:string){
    try{
      const workspace=repository.workspace(id)!;
      const linked=current(id);
      if(!provider)throw new ExecutionFailure('GITHUB_REQUIRED','Connect GitHub in the desktop app before starting coding.');
      const live=await provider.inspect(linked.projectId),expectedRepository=linked.coding!.repository!;
      if(live.id!==expectedRepository.id||live.fullName!==expectedRepository.fullName||live.private!==expectedRepository.private)throw new ExecutionFailure('REPOSITORY_CHANGED','The GitHub repository changed. Reconcile the connection first.');
      const issue=await provider.read(linked.projectId,expectedRepository,linked.coding!.issueNumber!);
      const fields=issueFields(issue,id);
      if(issue.state!=='open'||!fields||fields.title!==linked.title||fields.description!==linked.description||fields.acceptanceCriteria!==linked.acceptanceCriteria)throw new ExecutionFailure('SYNC_REQUIRED','Refresh linked work and reconcile the open Issue requirements before starting or resuming.');
      const delivery=repository.delivery(id);
      if(delivery?.pullNumber){const pull=await provider.pull(linked.projectId,expectedRepository,delivery.pullNumber);if(pull.merged||pull.state!=='open'||pull.headSha!==delivery.commitSha)throw new ExecutionFailure('REMOTE_HEAD_CHANGED','The PR changed or closed. Refresh review evidence before revising this worktree.');}
      const actual=await realpath(await git(workspace.workspacePath,['rev-parse','--show-toplevel'],abort.signal));
      const sourceCommon=await realpath(await git(workspace.sourcePath,['rev-parse','--path-format=absolute','--git-common-dir'],abort.signal));
      const worktreeCommon=await realpath(await git(workspace.workspacePath,['rev-parse','--path-format=absolute','--git-common-dir'],abort.signal));
      if(sourceCommon.toLowerCase()!==worktreeCommon.toLowerCase())throw new ExecutionFailure('WORKSPACE_CHANGED','The saved coding folder is no longer a worktree of its selected source repository.');
      if(actual.toLowerCase()!==(await realpath(workspace.workspacePath)).toLowerCase()||await git(workspace.workspacePath,['branch','--show-current'],abort.signal)!==workspace.branch)throw new ExecutionFailure('WORKSPACE_CHANGED','The ticket worktree or branch changed. Inspect it before resuming.');
      const summary=await ai.runWithChatGPT(async(client,_cwd,signal)=>{
        if(expected!==token(id))throw new ExecutionFailure('REQUIREMENTS_CHANGED','Ticket requirements changed before coding started.');
        update(runId,id,{processId:client.processId,stage:'coding',message:'Codex is working in the isolated ticket worktree.'});
        return codingTurn(client,workspace.workspacePath,prompt,{signal,
          identity:(threadId,turnId)=>update(runId,id,{threadId,turnId}),
          activity:text=>{const run=repository.latestRun(id);if(run?.id===runId&&run.stage!=='permission'&&run.stage!=='cancelling')save(run,'coding',text);},
          command:(command,exitCode,output)=>{const run=repository.latestRun(id);if(run?.id===runId)update(runId,id,{commands:[...run.commands,{command,exitCode,output,source:'runtime' as const,at:new Date().toISOString()}].slice(-100)});},
          permission:(method,params)=>approvals.request(id,runId,workspace.workspacePath,method,params,signal,waiting=>{
            const run=repository.latestRun(id);if(run?.id===runId&&run.stage!=='cancelling')save(run,waiting?'permission':'coding',waiting?'Waiting for your decision on the exact runtime request.':'The permission request ended.');
          }),
        });
      },abort.signal);
      if(expected!==token(id))throw new ExecutionFailure('REQUIREMENTS_CHANGED','The ticket changed during coding. Inspect retained changes before explicitly resuming with the new scope.');
      const run=repository.latestRun(id);if(run?.id===runId&&run.stage!=='merged')save({...run,summary,processId:null},'ready','Coding ended and the owned process closed. Inspect changes before publishing a PR.');
    }catch(error){
      const run=repository.latestRun(id);if(run?.id===runId){
        const code=abort.signal.aborted?'CANCELLED':error instanceof CodingTurnFailure||error instanceof CodexFailure||error instanceof CodexProcessFailure||error instanceof ExecutionFailure||error instanceof ProbeFailure?error.code:'UNKNOWN';
        const uncertain=error instanceof CodexProcessFailure&&error.cleanupFailed;
        if(run.stage!=='merged'||uncertain)save({...run,errorCode:code,processId:uncertain?run.processId:null},uncertain?'uncertain':code==='CANCELLED'?'stopped':'failed',uncertain?'Owned-process cleanup was not confirmed. Inspect and stop the previous process before recovery.':message(code));
      }
    }finally{approvals.cancel(id);const saved=repository.latestRun(id);if(saved?.id===runId&&saved.stage==='merged')repository.saveRun({...saved,processId:null});if(active?.runId===runId)active=null;}
  }
  function begin(id:string,input:unknown,resume=false):CodingState {
    const request=executionRecord(input),before=state(id),t=current(id),workspace=repository.workspace(id);
    if(request.confirmAllowance!==true||request.confirmScope!==true||request.requirementsToken!==before.requirementsToken)throw new ExecutionFailure('CONFIRM_REQUIRED','Confirm this ticket, workspace and Codex allowance for this exact request.');
    if(resume?!before.canResume:!before.canStart)throw new ExecutionFailure('NOT_ELIGIBLE','This ticket cannot start now. Check blockers, workspace and any active or uncertain run.');
    if(resume&&before.pullNumber&&request.headSha!==before.linkedHeadSha)throw new ExecutionFailure('STALE_REVISION','Preview feedback against the latest observed PR head before resuming.');
    const feedback=typeof request.feedback==='string'?request.feedback.trim():'';
    if(feedback.length>8000)throw new ExecutionFailure('FEEDBACK_TOO_LONG','Keep feedback within 8000 characters.');
    if(!workspace)throw new ExecutionFailure('NO_WORKSPACE','Prepare the ticket workspace first.');
    const now=new Date().toISOString(),run:CodingRun={id:randomUUID(),ticketId:id,stage:'starting',createdAt:now,updatedAt:now,
      processId:null,threadId:null,turnId:null,headSha:null,summary:'',errorCode:'',message:'Checking ChatGPT account and the retained worktree.',commands:[],events:[],
      feedback,feedbackHeadSha:resume?before.linkedHeadSha:null,previousRunId:before.run?.id??null,allowChecks:request.allowChecks===true,requirementsToken:before.requirementsToken};
    transaction(()=>{if(token(id)!==before.requirementsToken)throw new ExecutionFailure('STALE_REQUEST','The ticket changed. Refresh it first.');repository.saveRun(run);projects.setStatus(id,'in_progress',now);});
    const prompt=['Implement only this approved coding ticket. Do not publish, push, merge or deploy.',
      'Ticket #'+t.coding!.issueNumber+': '+t.title,t.description,'Acceptance criteria:',t.acceptanceCriteria,
      run.allowChecks?'You may run the project checks described by its instructions. Report actual commands and results.':'Do not run automated tests or verification commands. The owner will test locally. Report checks as not run.',
      resume?'This is a fresh context for the same branch/worktree. Preserve existing work and inspect it before editing.':'Use the prepared ticket branch and keep changes within the approved scope.',
      feedback?'Owner revision feedback:\n'+feedback:'',
      'Never read credentials, private environment files, personal task databases or unrelated folders. Finish with a plain-English change/check/concern summary.'].filter(Boolean).join('\n\n');
    const abort=new AbortController();
    const expected=token(id);
    const work=Promise.resolve().then(()=>perform(id,run.id,abort,prompt,expected));active={ticketId:id,runId:run.id,abort,work};void work.catch(()=>{});
    return state(id);
  }
  return {
    state,begin,
    stopForMerge(id:string){if(active?.ticketId===id){approvals.cancel(id);active.abort.abort();}},
    cancel(id:string){current(id);if(active?.ticketId!==id)throw new ExecutionFailure('NO_ACTIVE_RUN','No owned active coding process exists for this ticket.');const run=repository.latestRun(id);if(run)save(run,'cancelling','Cancellation requested. Waiting for interruption and actual process cleanup.');approvals.cancel(id);active.abort.abort();return state(id);},
    recover(id:string){current(id);if(active)throw new ExecutionFailure('BUSY','Stop the current owned run before recovery.');const run=repository.latestRun(id);if(!run)throw new ExecutionFailure('NO_RUN','There is no saved run to recover.');
      const delivery=repository.delivery(id);if(delivery&&['committing','creating-pr','uncertain'].includes(delivery.stage))throw new ExecutionFailure('PUBLICATION_UNCERTAIN','Inspect saved PR publication progress before recovering this coding run.');
      if(processState(run.processId)!=='stopped')throw new ExecutionFailure('PROCESS_UNCERTAIN','The saved process is still running or cannot be checked. It was not killed or reattached.');
      if(run.stage==='uncertain'||activeCodingStage(run.stage))save({...run,processId:null},'interrupted','The saved process is no longer running. Inspect changes, then explicitly resume a fresh coding context.');return state(id);},
    async close(){closing=true;approvals.close();const owned=active;if(owned){owned.abort.abort();await owned.work;}},
  };
}
export type CodingService=ReturnType<typeof createCodingService>;
