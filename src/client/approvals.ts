import { parseApproval } from '../shared/approvals.ts';

export function createApprovalClient(transport: typeof fetch=fetch) {
  async function request(id: string,input?: unknown) {
    const response=await transport('/api/project-tickets/'+id+'/coding/approval',input===undefined ? {} : {
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),
    });
    const body: unknown=await response.json();
    if (!response.ok) throw new Error(body && typeof body==='object' && 'error' in body && typeof body.error==='string' ? body.error : 'Permission decision could not be saved.');
    if (!body || typeof body!=='object' || !('ticketId' in body) || body.ticketId!==id || !('approval' in body)) throw new Error('Permission response belongs to another ticket.');
    return parseApproval(body.approval,id);
  }
  return { read:(id: string)=>request(id),decide:(id: string,input: unknown)=>request(id,input) };
}
