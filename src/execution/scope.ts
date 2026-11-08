import {createHash} from 'node:crypto';
import type {ProjectTicket,TicketDependency} from '../shared/projects.ts';
import type {CodingWorkspace} from '../shared/execution.ts';
export function codingScope(ticket:ProjectTicket,dependencies:TicketDependency[],workspace:CodingWorkspace|null):string {
  return createHash('sha256').update(JSON.stringify({id:ticket.id,title:ticket.title,description:ticket.description,acceptanceCriteria:ticket.acceptanceCriteria,
    coding:ticket.coding,executionMode:ticket.executionMode,blockReason:ticket.blockReason,dependencies,workspace})).digest('hex');
}
