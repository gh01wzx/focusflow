import type {RepositoryRequest} from './issues.ts';
import type {ReviewProvider,ReviewFile,ReviewCheck} from '../shared/review.ts';
import {codingPull} from './coding.ts';
import {parseLinkedIssue} from '../shared/linked-work.ts';
import {parseRemoteIssue} from './issues.ts';
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'?value as Record<string,unknown>:{};
const privatePath=/(^|\/)(?:\.env(?:\.[^/]*)?|\.git|\.codex|auth\.json|\.npmrc|config\.local\.[^/]*)(?:\/|$)|\.(?:pem|key|db|sqlite|log)$/i;
const safeUrl=(value:unknown)=>typeof value==='string'&&/^https:\/\/github\.com\//.test(value)?value:null;
const secret=/(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|github_pat_[A-Za-z0-9_]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|sk-(?:proj-)?[A-Za-z0-9_-]{30,})/;

export function createReviewProvider(run:RepositoryRequest):ReviewProvider {
  return {
    pull:(projectId,repository,number)=>run(projectId,repository,async(_r,request)=>codingPull(await request('/pulls/'+number),repository.id)),
    issue:(projectId,repository,number)=>run(projectId,repository,async(_r,request)=>{const raw=record(await request('/issues/'+number));return parseLinkedIssue({...parseRemoteIssue(raw),state:raw.state,updatedAt:raw.updated_at});}),
    closeIssue:(projectId,repository,number,ticketId)=>run(projectId,repository,async(_r,request)=>{
      const before=record(await request('/issues/'+number));if(before.pull_request||typeof before.body!=='string'||!before.body.includes('<!-- focusflow-ticket:'+ticketId+' -->'))throw new Error('Issue identity or task marker changed.');
      const after=record(before.state==='closed'?before:await request('/issues/'+number,'PATCH',{state:'closed',state_reason:'completed'}));
      if(after.number!==number||after.state!=='closed')throw new Error('GitHub did not confirm Issue closure.');
      return parseLinkedIssue({...parseRemoteIssue(after),state:after.state,updatedAt:after.updated_at});
    }),
    evidence:(projectId,repository,number)=>run(projectId,repository,async(_r,request)=>{
      const before=record(await request('/pulls/'+number)),pull=codingPull(before,repository.id);
      const raw=await request('/pulls/'+number+'/files?per_page=100');if(!Array.isArray(raw))throw new Error('GitHub diff is unavailable.');
      const files:ReviewFile[]=[];let total=0;
      for(const source of raw.slice(0,100)){
        const f=record(source);if(typeof f.filename!=='string'||f.filename.length>2000||typeof f.status!=='string'||typeof f.sha!=='string'||!/^[a-f0-9]{40}$/.test(f.sha))throw new Error('Invalid changed-file evidence.');
        let safe=!privatePath.test(f.filename);let patch=safe&&typeof f.patch==='string'?f.patch.slice(0,20000):null;
        if(patch&&secret.test(patch)){safe=false;patch=null;}
        let text:string|null=null;
        if(safe&&f.status!=='removed'&&total<120000){try{
          const blob=record(await request('/git/blobs/'+f.sha));
          if(blob.encoding==='base64'&&typeof blob.content==='string'&&typeof blob.size==='number'&&blob.size<=20000){const bytes=Buffer.from(blob.content.replace(/\s/g,''),'base64'),decoded=bytes.toString('utf8');if(!bytes.includes(0)&&Buffer.from(decoded,'utf8').equals(bytes)&&!secret.test(decoded)){text=decoded;total+=text.length;}else if(secret.test(decoded)){safe=false;patch=null;}}
        }catch{/* Missing source excerpts remain unavailable, never invented. */}}
        files.push({path:f.filename,status:f.status,additions:typeof f.additions==='number'?f.additions:0,deletions:typeof f.deletions==='number'?f.deletions:0,patch,sha:f.sha,source:text,
          complete:safe&&typeof f.patch==='string'&&f.patch.length<=20000});
      }
      const checks:ReviewCheck[]=[];let checksAvailable=true,checksComplete=true;
      try{const response=record(await request('/commits/'+pull.headSha+'/check-runs?per_page=100'));if(!Array.isArray(response.check_runs))throw new Error('Missing check runs');
        for(const value of response.check_runs.slice(0,100)){const c=record(value);checks.push({name:String(c.name??'Check').slice(0,300),status:String(c.status??'unknown').slice(0,100),conclusion:typeof c.conclusion==='string'?c.conclusion.slice(0,100):null,url:safeUrl(c.html_url),source:'check-run'});}
        if(typeof response.total_count!=='number'||response.total_count>100)checksComplete=false;
      }catch{checksAvailable=false;checksComplete=false;}
      try{const response=record(await request('/commits/'+pull.headSha+'/status'));if(!Array.isArray(response.statuses))throw new Error('Missing statuses');
        for(const value of response.statuses.slice(0,100)){const c=record(value);checks.push({name:String(c.context??'Commit status').slice(0,300),status:'completed',conclusion:typeof c.state==='string'?c.state.slice(0,100):null,url:safeUrl(c.target_url),source:'commit-status'});}
        if(typeof response.total_count!=='number'||response.total_count>100)checksComplete=false;
      }catch{checksAvailable=false;checksComplete=false;}
      const after=codingPull(await request('/pulls/'+number),repository.id);if(after.headSha!==pull.headSha||after.updatedAt!==pull.updatedAt)throw new Error('The PR changed while evidence was being read. Refresh again.');
      return {pull:after,files,checks,filesComplete:typeof before.changed_files==='number'&&before.changed_files===files.length&&files.every(f=>f.complete),checksAvailable,checksComplete,fetchedAt:new Date().toISOString()};
    }),
  };
}
