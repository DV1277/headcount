import type {AgentId, DeptId} from './roster';
import type {Plan, ArtifactMeta} from './domain';
// packages/contracts/src/events.ts
export type EventEnvelope<T extends TownEvent = TownEvent> = {
  v: 1;
  runId: string;          // 'run_' + nanoid(10)
  seq: number;            // 1-based, gapless per run
  t: number;              // ms since run.created
  at: string;             // ISO timestamp
} & T;

export type TownEvent =
  | { type: 'run.created';      data: { idea: string; mode: 'live' | 'mock' | 'demo' } }
  | { type: 'mayor.thinking';   data: { phase: 'plan' | 'review' | 'brief' | 'repair'; taskId?: string } }
  | { type: 'founder.question'; data: { qid: string; text: string } }
  | { type: 'founder.answer';   data: { qid: string; text: string } }
  | { type: 'plan.proposed';    data: { plan: Plan; source: 'model' | 'repaired' | 'template' } }
  | { type: 'plan.approved';    data: { plan: Plan; edited: boolean } }
  | { type: 'handoff';          data: { from: DeptId; to: DeptId; taskId: string; artifactId: string; summary: string } }
  | { type: 'task.dispatched';  data: { taskId: string; agent: DeptId; attempt: number; via: 'creao-realtime' | 'creao-async' | 'mayor-cover' | 'mock' } }
  | { type: 'task.started';     data: { taskId: string; agent: DeptId; externalRunId?: string } }
  | { type: 'agent.tool';       data: { agent: AgentId; taskId?: string; tool: string; label: string } }     // label ≤ 80
  | { type: 'agent.progress';   data: { agent: AgentId; taskId?: string; note: string } }                   // heartbeat; note ≤ 80
  | { type: 'agent.say';        data: { agent: AgentId; text: string; source: 'model' | 'canned' } }       // ≤ 80
  | { type: 'artifact.created'; data: { artifact: ArtifactMeta } }
  | { type: 'task.submitted';   data: { taskId: string; artifactId: string } }
  | { type: 'review.verdict';   data: { taskId: string; artifactId: string; verdict: 'accept' | 'revise'; note: string } }
  | { type: 'task.revising';    data: { taskId: string; note: string; by: 'mayor' | 'founder' } }
  | { type: 'task.completed';   data: { taskId: string; artifactId: string; revised: boolean } }
  | { type: 'task.failed';      data: { taskId: string; error: { code: ErrorCode; message: string }; willRetry: boolean; next: 'retry' | 'mayor-cover' | 'skip' } }
  | { type: 'founder.redirect'; data: { agent: DeptId; taskId: string; note: string } }
  | { type: 'run.paused';       data: {} }
  | { type: 'run.resumed';      data: {} }
  | { type: 'payroll.tick';     data: { agent: AgentId; credits?: number; tokensIn?: number; tokensOut?: number; usd: number } }
  | { type: 'brief.ready';      data: { artifactId: string } }
  | { type: 'run.completed';    data: { siteUrl: string | null; stats: RunStats } }
  | { type: 'task.skipped';     data: { taskId: string; reason: string } }                                 // unticked at approval, or ladder rung D
  | { type: 'run.finishing';    data: {} }                                                                     // all tasks terminal; brief starts
  | { type: 'run.failed';       data: { error: { code: ErrorCode; message: string } } };

export type ErrorCode = 'timeout' | 'upstream' | 'unparseable' | 'budget' | 'cancelled' | 'server_restart' | 'unknown';
export type RunStats = { tasks: number; handoffs: number; revisions: number; minutes: number; credits: number; usd: number };
