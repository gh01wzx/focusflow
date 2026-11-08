import type {RemoteCodingPull} from './delivery.ts';
import type {LinkedIssue} from './linked-work.ts';
import type {GitHubRepository} from './github.ts';
import {parseLinkedPull,parseLinkedIssue} from './linked-work.ts';
import {executionRecord} from './execution.ts';

export interface ReviewFile {path:string;status:string;additions:number;deletions:number;patch:string|null;sha:string;source:string|null;complete:boolean}
export interface ReviewCheck {name:string;status:string;conclusion:string|null;url:string|null;source:'check-run'|'commit-status'}
export interface ReviewEvidence {pull:RemoteCodingPull;files:ReviewFile[];checks:ReviewCheck[];filesComplete:boolean;checksAvailable:boolean;checksComplete:boolean;fetchedAt:string}
export interface ReviewAnswer {id:string;kind:'summary'|'independent'|'question';question:string;text:string;headSha:string;scope:string;createdAt:string}
export interface ReviewRecord {evidence:ReviewEvidence|null;answers:ReviewAnswer[];approval:{headSha:string;scope:string;at:string;unverifiedAccepted:boolean}|null;
  issue:LinkedIssue|null;error:string;pending:string|null;mergeNotice:string}
export interface ReviewState extends ReviewRecord {ticketId:string;busy:boolean;stale:boolean;approved:boolean;scope:string;pullUrl:string}
export interface ReviewProvider {
  evidence(projectId:string,repository:GitHubRepository,number:number):Promise<ReviewEvidence>;
  pull(projectId:string,repository:GitHubRepository,number:number):Promise<RemoteCodingPull>;
  issue(projectId:string,repository:GitHubRepository,number:number):Promise<LinkedIssue>;
  closeIssue(projectId:string,repository:GitHubRepository,number:number,ticketId:string):Promise<LinkedIssue>;
}
export function emptyReview():ReviewRecord{return{evidence:null,answers:[],approval:null,issue:null,error:'',pending:null,mergeNotice:''};}
export function parseReviewState(value:unknown,id:string):ReviewState {
  const r=executionRecord(value);if(r.ticketId!==id||typeof r.busy!=='boolean'||typeof r.stale!=='boolean'||typeof r.approved!=='boolean'
    ||typeof r.scope!=='string'||!/^[a-f0-9]{64}$/.test(r.scope)||typeof r.pullUrl!=='string'||!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9][0-9]*$/.test(r.pullUrl)
    ||typeof r.error!=='string'||r.error.length>2000||!(r.pending===null||typeof r.pending==='string')||typeof r.mergeNotice!=='string'||r.mergeNotice.length>2000
    ||!Array.isArray(r.answers)||r.answers.length>30||!r.answers.every(raw=>{const a=executionRecord(raw);return typeof a.id==='string'&&['summary','independent','question'].includes(String(a.kind))&&typeof a.question==='string'&&a.question.length<=4000&&typeof a.text==='string'&&a.text.length<=64000&&typeof a.headSha==='string'&&/^[a-f0-9]{40}$/.test(a.headSha)&&typeof a.scope==='string'&&/^[a-f0-9]{64}$/.test(a.scope)&&typeof a.createdAt==='string'&&Number.isFinite(Date.parse(a.createdAt));}))throw new Error('Invalid review state.');
  if(r.evidence!==null){const e=executionRecord(r.evidence);parseLinkedPull(e.pull);
    if(!Array.isArray(e.files)||e.files.length>100||!e.files.every(raw=>{const f=executionRecord(raw);return typeof f.path==='string'&&f.path.length<=2000&&typeof f.status==='string'&&typeof f.additions==='number'&&typeof f.deletions==='number'&&(f.patch===null||typeof f.patch==='string'&&f.patch.length<=20000)&&(f.source===null||typeof f.source==='string'&&f.source.length<=20000)&&typeof f.sha==='string'&&typeof f.complete==='boolean';})
      ||!Array.isArray(e.checks)||e.checks.length>200||!e.checks.every(raw=>{const c=executionRecord(raw);return typeof c.name==='string'&&typeof c.status==='string'&&(c.conclusion===null||typeof c.conclusion==='string')&&(c.url===null||typeof c.url==='string'&&/^https:\/\/github\.com\//.test(c.url))&&['check-run','commit-status'].includes(String(c.source));})
      ||typeof e.filesComplete!=='boolean'||typeof e.checksAvailable!=='boolean'||typeof e.checksComplete!=='boolean'||typeof e.fetchedAt!=='string'||!Number.isFinite(Date.parse(e.fetchedAt)))throw new Error('Invalid PR evidence.');
  }
  if(r.issue!==null)parseLinkedIssue(r.issue);
  if(r.approval!==null){const a=executionRecord(r.approval);if(typeof a.headSha!=='string'||!/^[a-f0-9]{40}$/.test(a.headSha)||typeof a.scope!=='string'||!/^[a-f0-9]{64}$/.test(a.scope)||typeof a.at!=='string'||!Number.isFinite(Date.parse(a.at))||typeof a.unverifiedAccepted!=='boolean')throw new Error('Invalid local approval.');}
  return r as unknown as ReviewState;
}
