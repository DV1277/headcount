import type { AgentId, ArtifactMeta, DeptId, Plan, RunStatus, TaskStatus } from '@hc/contracts';
import type { TownEvent } from '@hc/contracts';

export type TownState = {
  runId: string | null; idea: string; title: string; mode: 'live' | 'mock' | 'demo';
  status: RunStatus; plan: Plan | null; planSource: 'model' | 'repaired' | 'template' | null;
  tasks: Record<string, { def: Plan['tasks'][number]; status: TaskStatus; attempt: number; artifactId?: string; revised: boolean; via?: string }>;
  agents: Record<AgentId, { status: 'idle' | 'walking' | 'working' | 'waiting' | 'blocked' | 'paused'; taskId?: string; credits: number; usd: number; log: { seq: number; t: number; text: string; kind: TownEvent['type'] }[] }>;
  artifacts: Record<string, ArtifactMeta & { review?: { verdict: 'accept' | 'revise'; note: string }; stale?: boolean }>;
  handoffs: { from: DeptId; to: DeptId; artifactId: string; t: number }[];
  questions: { qid: string; text: string; answered: boolean }[];
  payroll: { credits: number; usd: number; byAgent: Record<AgentId, { credits: number; usd: number }> };
  progress: number; lastSeq: number; t: number;
};

export function initialState(): TownState {
  const emptyAgent = (): TownState['agents'][AgentId] => ({ status: 'idle', credits: 0, usd: 0, log: [] });
  const emptyPay = (): TownState['payroll']['byAgent'][AgentId] => ({ credits: 0, usd: 0 });
  const agents: TownState['agents'] = { mayor: emptyAgent(), scout: emptyAgent(), maker: emptyAgent(), herald: emptyAgent(), founder: emptyAgent() };
  const byAgent: TownState['payroll']['byAgent'] = { mayor: emptyPay(), scout: emptyPay(), maker: emptyPay(), herald: emptyPay(), founder: emptyPay() };
  return { runId: null, idea: '', title: '', mode: 'mock', status: 'drafting', plan: null, planSource: null, tasks: {}, agents, artifacts: {}, handoffs: [], questions: [], payroll: { credits: 0, usd: 0, byAgent }, progress: 0, lastSeq: 0, t: 0 };
}
