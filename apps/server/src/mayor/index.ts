// O4 Mayor (PRD §8.8). Implementations: MockMayor (deterministic, HC_MOCK_SPEED scaled) and
// StepfunMayor (step-5-preview only, A-02..A-04).
import type { Artifact, ArtifactKind, BriefPayload, Plan, PlanTask } from '@hc/contracts';
import { MockMayor } from './mock';
import { StepfunMayor } from './mayor-stepfun';

export type Usage={tokensIn:number;tokensOut:number;cachedIn?:number};
export interface Mayor {
  plan(i:{idea:string;answers?:{q:string;a:string}[]}):Promise<{plan:Plan;source:'model'|'repaired'|'template';usage:Usage}>;
  review(i:{idea:string;task:PlanTask;artifact:Artifact}):Promise<{verdict:'accept'|'revise';note:string;usage:Usage}>;
  brief(i:{idea:string;plan:Plan;artifacts:Artifact[]}):Promise<{brief:BriefPayload;usage:Usage}>;
  say(i:{moment:'planned'|'approved'|'handoff'|'accepted'|'completed';context:string}):Promise<{text:string;source:'model'|'canned';usage:Usage}>;
  cover(i:{idea:string;task:PlanTask;inputs:Artifact[]}):Promise<{payload:unknown;usage:Usage}>;
  repairJson<T>(i:{raw:string;schemaName:'plan'|ArtifactKind;errors:string}):Promise<{value:T|null;usage:Usage}>;
}

export function createMayor():Mayor {
  return process.env.HC_MAYOR==='mock' ? new MockMayor() : new StepfunMayor();
}
