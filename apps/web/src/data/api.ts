import type { Artifact, DeptId, HealthResponse, Plan } from '@hc/contracts';
import type { TownState } from '@hc/engine';
export async function request<T>(path:string,body?:unknown,signal?:AbortSignal):Promise<T> {
  const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:signal??AbortSignal.timeout(15000)});
  if (!response.ok) {
    const value=await response.json().catch(()=>null) as {error?:{message?:string}}|null;
    throw new Error(value?.error?.message??`Request failed (${response.status}).`);
  }
  return response.status===204?undefined as T:await response.json() as T;
}
export const api = {
  health:()=>request<HealthResponse>('/api/health'),
  createRun:(idea:string)=>request<{runId:string}>('/api/runs',{idea}),
  getRun:(id:string)=>request<{state:TownState}>(`/api/runs/${encodeURIComponent(id)}`),
  approve:(id:string,plan:Plan)=>request<void>(`/api/runs/${encodeURIComponent(id)}/approve`,{plan}),
  answer:(id:string,qid:string,text:string)=>request<void>(`/api/runs/${encodeURIComponent(id)}/answer`,{qid,text}),
  redirect:(id:string,agent:DeptId,note:string)=>request<void>(`/api/runs/${encodeURIComponent(id)}/redirect`,{agent,note}),
  pause:(id:string)=>request<void>(`/api/runs/${encodeURIComponent(id)}/pause`,{}),
  resume:(id:string)=>request<void>(`/api/runs/${encodeURIComponent(id)}/resume`,{}),
  replan:(id:string)=>request<void>(`/api/runs/${encodeURIComponent(id)}/replan`,{}),
  getArtifact:(id:string,aid:string)=>request<Artifact>(`/api/runs/${encodeURIComponent(id)}/artifacts/${encodeURIComponent(aid)}`),
};
