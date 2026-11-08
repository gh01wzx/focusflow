import type {GitHubRepository} from './github.ts';
import type {LinkedPull} from './linked-work.ts';
import {executionRecord} from './execution.ts';
import {parseGitHubRepository} from './github.ts';
export interface DeliveryFile {path:string;deleted:boolean;binary:boolean;size:number;sha256:string;mode:'100644'|'100755'}
export interface DeliveryPreview {ticketId:string;runId:string;repository:GitHubRepository;branch:string;baseSha:string;files:DeliveryFile[];token:string;pullNumber:number|null}
export interface CodingDelivery {ticketId:string;branch:string;baseSha:string;commitSha:string|null;previousSha:string|null;pullNumber:number|null;digest:string;
  stage:'committing'|'creating-pr'|'uncertain'|'published'|'conflict';message:string;updatedAt:string}
export interface DeliveryState {ticketId:string;delivery:CodingDelivery|null;preview:DeliveryPreview|null;busy:boolean}
export interface RemoteCodingPull extends LinkedPull {headRef:string;baseRef:string;headRepositoryId:number;baseRepositoryId:number}
export interface CodingProvider {
  inspect(projectId:string):Promise<GitHubRepository>;
  branch(projectId:string,repository:GitHubRepository,branch:string):Promise<string|null>;
  baseTree(projectId:string,repository:GitHubRepository,commit:string):Promise<string>;
  commit(projectId:string,repository:GitHubRepository,parent:string,baseTree:string,files:{path:string;mode:'100644'|'100755';content:string|null}[],message:string):Promise<string>;
  writeBranch(projectId:string,repository:GitHubRepository,branch:string,sha:string,exists:boolean):Promise<void>;
  findPulls(projectId:string,repository:GitHubRepository,branch:string,marker:string):Promise<RemoteCodingPull[]>;
  createPull(projectId:string,repository:GitHubRepository,branch:string,title:string,body:string):Promise<RemoteCodingPull>;
  pull(projectId:string,repository:GitHubRepository,number:number):Promise<RemoteCodingPull>;
}
export function parseDeliveryState(value:unknown,id:string):DeliveryState {
  const s=executionRecord(value);if(s.ticketId!==id||typeof s.busy!=='boolean')throw new Error('Invalid publication state.');
  let delivery:CodingDelivery|null=null,preview:DeliveryPreview|null=null;
  const validSha=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
  if(s.delivery!==null){const d=executionRecord(s.delivery);
    if(d.ticketId!==id||typeof d.branch!=='string'||!validSha(d.baseSha)||!(d.commitSha===null||validSha(d.commitSha))||!(d.previousSha===null||validSha(d.previousSha))
      ||!(d.pullNumber===null||Number.isSafeInteger(d.pullNumber)&&Number(d.pullNumber)>0)||typeof d.digest!=='string'||!/^[a-f0-9]{64}$/.test(d.digest)
      ||!['committing','creating-pr','uncertain','published','conflict'].includes(String(d.stage))||typeof d.message!=='string'||d.message.length>2000||typeof d.updatedAt!=='string'||!Number.isFinite(Date.parse(d.updatedAt)))throw new Error('Invalid saved publication.');
    delivery=d as unknown as CodingDelivery;
  }
  if(s.preview!==null){const p=executionRecord(s.preview);
    if(p.ticketId!==id||typeof p.runId!=='string'||typeof p.branch!=='string'||!validSha(p.baseSha)||typeof p.token!=='string'||!/^[a-f0-9]{64}$/.test(p.token)
      ||!(p.pullNumber===null||Number.isSafeInteger(p.pullNumber)&&Number(p.pullNumber)>0)||!Array.isArray(p.files)||p.files.length>100||!p.files.every(raw=>{
        const f=executionRecord(raw);return typeof f.path==='string'&&f.path.length<=2000&&typeof f.deleted==='boolean'&&typeof f.binary==='boolean'&&typeof f.size==='number'&&f.size>=0&&typeof f.sha256==='string'&&/^[a-f0-9]{64}$/.test(f.sha256)&&['100644','100755'].includes(String(f.mode));
      }))throw new Error('Invalid publication preview.');
    preview={...p,repository:parseGitHubRepository(p.repository)} as unknown as DeliveryPreview;
  }
  return {ticketId:id,delivery,preview,busy:s.busy};
}
