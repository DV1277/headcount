import type { Artifact, ArtifactKind, BriefPayload, Plan, PlanTask } from '@hc/contracts';
export type Usage={tokensIn:number;tokensOut:number;cachedIn?:number};
export interface Mayor {
  plan(i:{idea:string;answers?:{q:string;a:string}[]}):Promise<{plan:Plan;source:'model'|'repaired'|'template';usage:Usage}>;
  review(i:{idea:string;task:PlanTask;artifact:Artifact}):Promise<{verdict:'accept'|'revise';note:string;usage:Usage}>;
  brief(i:{idea:string;plan:Plan;artifacts:Artifact[]}):Promise<{brief:BriefPayload;usage:Usage}>;
  say(i:{moment:'planned'|'approved'|'handoff'|'accepted'|'completed';context:string}):Promise<{text:string;source:'model'|'canned';usage:Usage}>;
  cover(i:{idea:string;task:PlanTask;inputs:Artifact[]}):Promise<{payload:unknown;usage:Usage}>;
  repairJson<T>(i:{raw:string;schemaName:'plan'|ArtifactKind;errors:string}):Promise<{value:T|null;usage:Usage}>;
}
export function createMayor():Mayor {throw new Error('Not implemented: O4 A-01/A-03 Mayor adapter.');}
