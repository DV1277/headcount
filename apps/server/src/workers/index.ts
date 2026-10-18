// O4 workers (PRD §8.8). Implementations: MockWorker (deterministic, HC_MOCK_SPEED scaled) and the
// CREAO worker (realtime NDJSON rung A → async rung B; app mode is async-only).
import type { Artifact, DeptId, ErrorCode, LaunchKitPayload, PlanTask, ResearchPayload, SitePayload } from '@hc/contracts';
import { MockWorker } from './mock';
import { createCreaoWorker } from './creao-worker';
import type { Usage } from '../mayor';

export type WorkerInput={runId:string;task:PlanTask;idea:string;inputs:Artifact[];founderNotes:string[];siteUrl:string};
export type WorkerEvent={kind:'started';externalRunId?:string}|{kind:'tool';tool:string;label:string}|{kind:'progress';note:string};
export type WorkerResult=({ok:true;payload:ResearchPayload|SitePayload|LaunchKitPayload;credits:number|null;raw:string;via:'creao-realtime'|'creao-async'|'mock'}|{ok:false;error:{code:ErrorCode;message:string};retryable:boolean;credits?:number|null}) & {mayorUsage?:Usage};
export interface Worker {run(i:WorkerInput,onEvent:(e:WorkerEvent)=>void,signal:AbortSignal):Promise<WorkerResult>}

export function getWorker(agent:DeptId):Worker {
  return process.env.HC_WORKERS==='mock' ? new MockWorker() : createCreaoWorker(agent);
}
