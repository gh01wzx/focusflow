import { executionRecord } from './execution.ts';

export const CODING_STAGES=['starting','coding','permission','cancelling','ready','publishing','review','stopped','failed','interrupted','uncertain','merged'] as const;
export type CodingStage=typeof CODING_STAGES[number];
export interface CodingCommand { command:string;exitCode:number|null;output:string;source:'runtime';at:string }
export interface CodingRun {
  id:string;ticketId:string;stage:CodingStage;createdAt:string;updatedAt:string;
  processId:number|null;threadId:string|null;turnId:string|null;headSha:string|null;
  summary:string;errorCode:string;message:string;commands:CodingCommand[];events:{at:string;text:string}[];
  feedback:string;previousRunId:string|null;allowChecks:boolean;
  requirementsToken?:string;
}
export interface CodingState {
  ticketId:string;run:CodingRun|null;activeTicketId:string|null;canStart:boolean;canResume:boolean;requirementsToken:string;
  history:{id:string;stage:CodingStage;createdAt:string;updatedAt:string;headSha:string|null;feedback:string;summary:string}[];
}
export function activeCodingStage(stage:CodingStage):boolean { return ['starting','coding','permission','cancelling','publishing','uncertain'].includes(stage); }
export function parseCodingState(value:unknown,ticketId:string):CodingState {
  const item=executionRecord(value);
  if(item.ticketId!==ticketId||typeof item.canStart!=='boolean'||typeof item.canResume!=='boolean'
    ||!(item.activeTicketId===null||typeof item.activeTicketId==='string'&&/^[a-f0-9-]{36}$/.test(item.activeTicketId))
    ||typeof item.requirementsToken!=='string'||!/^[a-f0-9]{64}$/.test(item.requirementsToken)||!Array.isArray(item.history)||item.history.length>20
    ||!item.history.every(raw=>{const h=executionRecord(raw);return typeof h.id==='string'&&/^[a-f0-9-]{36}$/.test(h.id)&&CODING_STAGES.includes(h.stage as CodingStage)
      &&typeof h.createdAt==='string'&&Number.isFinite(Date.parse(h.createdAt))&&typeof h.updatedAt==='string'&&Number.isFinite(Date.parse(h.updatedAt))
      &&(h.headSha===null||typeof h.headSha==='string'&&/^[a-f0-9]{40}$/.test(h.headSha))&&typeof h.feedback==='string'&&h.feedback.length<=8000&&typeof h.summary==='string'&&h.summary.length<=4000;}))throw new Error('Invalid coding state.');
  let run:CodingRun|null=null;
  if(item.run!==null){const r=executionRecord(item.run);
    if(r.ticketId!==ticketId||typeof r.id!=='string'||!/^[a-f0-9-]{36}$/.test(r.id)||!CODING_STAGES.includes(r.stage as CodingStage)
      ||typeof r.summary!=='string'||r.summary.length>80000||typeof r.message!=='string'||r.message.length>2000||typeof r.errorCode!=='string'
      ||typeof r.feedback!=='string'||r.feedback.length>8000||typeof r.allowChecks!=='boolean'
      ||!['createdAt','updatedAt'].every(key=>typeof r[key]==='string'&&Number.isFinite(Date.parse(r[key] as string)))
      ||!(r.processId===null||Number.isSafeInteger(r.processId)&&Number(r.processId)>0)
      ||!['threadId','turnId','previousRunId'].every(key=>r[key]===null||typeof r[key]==='string'&&(r[key] as string).length<=200)
      ||!(r.headSha===null||typeof r.headSha==='string'&&/^[a-f0-9]{40}$/.test(r.headSha))
      ||!Array.isArray(r.events)||r.events.length>200||!r.events.every(e=>{const v=executionRecord(e);return typeof v.text==='string'&&v.text.length<=1000&&typeof v.at==='string'&&Number.isFinite(Date.parse(v.at));})
      ||!Array.isArray(r.commands)||r.commands.length>100||!r.commands.every(c=>{const v=executionRecord(c);return typeof v.command==='string'&&v.command.length<=8000&&typeof v.output==='string'&&v.output.length<=10000&&v.source==='runtime'&&(v.exitCode===null||Number.isInteger(v.exitCode))&&typeof v.at==='string'&&Number.isFinite(Date.parse(v.at));}))throw new Error('Invalid coding run record.');
    run=r as unknown as CodingRun;
  }
  return {ticketId,run,activeTicketId:item.activeTicketId as string|null,canStart:item.canStart,canResume:item.canResume,requirementsToken:item.requirementsToken,history:item.history as CodingState['history']};
}
