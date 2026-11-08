import type {CodingProvider,RemoteCodingPull} from '../shared/delivery.ts';
import {CodingCreationRefused} from '../shared/delivery.ts';
import type {RepositoryRequest} from './issues.ts';
import {parseLinkedPull} from '../shared/linked-work.ts';

const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'?value as Record<string,unknown>:{};
const sha=(value:unknown)=>{if(typeof value!=='string'||!/^[a-f0-9]{40}$/.test(value))throw new Error('GitHub returned an invalid commit identity.');return value;};
export function codingPull(raw:unknown,repositoryId:number):RemoteCodingPull {
  const p=record(raw),head=record(p.head),base=record(p.base),headRepo=record(head.repo),baseRepo=record(base.repo);
  if(headRepo.id!==repositoryId||baseRepo.id!==repositoryId||typeof head.ref!=='string'||typeof base.ref!=='string')throw new Error('The PR must belong to the selected repository, without a replacement head repository.');
  return {...parseLinkedPull({number:p.number,title:p.title,body:p.body??'',state:p.state,updatedAt:p.updated_at,
    headSha:head.sha,merged:p.merged===true||typeof p.merged_at==='string',mergeCommitSha:p.merge_commit_sha??null}),
    headRef:head.ref,baseRef:base.ref,headRepositoryId:repositoryId,baseRepositoryId:repositoryId};
}
export function createCodingProvider(run:RepositoryRequest):CodingProvider {
  return {
    inspect:projectId=>run(projectId,null,async repository=>repository),
    branch:(projectId,repository,branch)=>run(projectId,repository,async(_r,request)=>{
      const refs=await request('/git/matching-refs/heads/'+encodeURIComponent(branch));
      if(!Array.isArray(refs))throw new Error('Could not inspect the coding branch.');
      const found=refs.map(record).find(value=>value.ref==='refs/heads/'+branch);
      return found?sha(record(found.object).sha):null;
    }),
    baseTree:(projectId,repository,commit)=>run(projectId,repository,async(_r,request)=>sha(record(record(await request('/git/commits/'+sha(commit))).tree).sha)),
    commit:(projectId,repository,parent,baseTree,files,message)=>run(projectId,repository,async(_r,request)=>{
      const entries:{path:string;mode:string;type:string;sha:string|null}[]=[];
      for(const file of files){
        const blob=file.content===null?null:sha(record(await request('/git/blobs','POST',{content:file.content,encoding:'base64'})).sha);
        entries.push({path:file.path,mode:file.mode,type:'blob',sha:blob});
      }
      const tree=sha(record(await request('/git/trees','POST',{base_tree:sha(baseTree),tree:entries})).sha);
      return sha(record(await request('/git/commits','POST',{message,tree,parents:[sha(parent)]})).sha);
    }),
    writeBranch:(projectId,repository,branch,commit,exists)=>run(projectId,repository,async(_r,request)=>{
      const result=record(await request(exists?'/git/refs/heads/'+encodeURIComponent(branch):'/git/refs',exists?'PATCH':'POST',
        exists?{sha:sha(commit),force:false}:{ref:'refs/heads/'+branch,sha:sha(commit)}));
      if(result.ref!=='refs/heads/'+branch||sha(record(result.object).sha)!==commit)throw new Error('GitHub did not confirm the expected branch head.');
    }),
    findPulls:(projectId,repository,branch,marker)=>run(projectId,repository,async(_r,request)=>{
      const matches:RemoteCodingPull[]=[];
      for(let page=1;page<=20;page++){
        const result=await request('/pulls?state=all&per_page=100&head='+encodeURIComponent(repository.fullName.split('/')[0]+':'+branch)+'&page='+page);
        if(!Array.isArray(result))throw new Error('Could not reconcile PR identities.');
        for(const raw of result){const p=record(raw);if(typeof p.body==='string'&&p.body.includes(marker)){const pull=codingPull(raw,repository.id);if(pull.headRef===branch)matches.push(pull);}}
        if(result.length<100)return matches;
      }
      throw new Error('The PR scan was incomplete. Inspect the existing PR rather than creating another.');
    }),
    createPull:(projectId,repository,branch,title,body)=>run(projectId,repository,async(_r,request)=>{
      const info=record(await request(''));if(typeof info.default_branch!=='string')throw new Error('GitHub default branch is unavailable.');
      let result:unknown;try{result=await request('/pulls','POST',{head:branch,base:info.default_branch,title,body});}
      catch(error){if(error&&typeof error==='object'&&'refused'in error&&error.refused===true)throw new CodingCreationRefused('GitHub explicitly refused PR creation.');throw error;}
      return codingPull(result,repository.id);
    }),
    pull:(projectId,repository,number)=>run(projectId,repository,async(_r,request)=>{
      if(!Number.isSafeInteger(number)||number<1)throw new Error('Invalid PR number.');
      const pull=codingPull(await request('/pulls/'+number),repository.id);if(pull.number!==number)throw new Error('PR identity changed.');return pull;
    }),
  };
}
