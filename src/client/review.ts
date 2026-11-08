import {parseReviewState} from '../shared/review.ts';
export function createReviewClient(transport:typeof fetch=fetch){
  async function request(id:string,action='',input?:unknown){
    const response=await transport('/api/project-tickets/'+id+'/coding/review'+(action?'/'+action:''),input===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
    const body:unknown=await response.json();if(!response.ok)throw new Error(body&&typeof body==='object'&&'error'in body&&typeof body.error==='string'?body.error:'Review could not be updated.');
    return parseReviewState(body,id);
  }
  return{read:(id:string)=>request(id),act:(id:string,action:string,input:unknown={})=>request(id,action,input)};
}
