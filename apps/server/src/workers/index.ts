import type { Artifact, DeptId, ErrorCode, LaunchKitPayload, PlanTask, ResearchPayload, SitePayload } from '@hc/contracts';
export type WorkerInput={runId:string;task:PlanTask;idea:string;inputs:Artifact[];founderNotes:string[];siteUrl:string};
export type WorkerEvent={kind:'started';externalRunId?:string}|{kind:'tool';tool:string;label:string}|{kind:'progress';note:string};
export type WorkerResult={ok:true;payload:ResearchPayload|SitePayload|LaunchKitPayload;credits:number|null;raw:string;via:'creao-realtime'|'creao-async'|'mock'}|{ok:false;error:{code:ErrorCode;message:string};retryable:boolean};
export interface Worker {run(i:WorkerInput,onEvent:(e:WorkerEvent)=>void,signal:AbortSignal):Promise<WorkerResult>}
export function getWorker(_agent:DeptId):Worker {throw new Error('Not implemented: O4 A-01/A-05 worker adapter.');}
