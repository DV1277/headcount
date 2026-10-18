import type { AgentId, ArtifactKind, BuildingId, DeptId, EventEnvelope } from '@hc/contracts';
import type { TownState } from './state.js';
export type Cue =
  | { kind: 'walk'; agent: AgentId; to: BuildingId; carrying?: { artifactId: string; kind: ArtifactKind } }
  | { kind: 'enter'; agent: AgentId; building: BuildingId }
  | { kind: 'exit'; agent: AgentId; building: BuildingId }
  | { kind: 'bubble'; agent: AgentId; text: string; priority: 1 | 2 | 3 | 4 }
  | { kind: 'glow'; building: BuildingId; on: boolean; color: string }
  | { kind: 'alert'; building: BuildingId; on: boolean; tone: 'question' | 'error' }
  | { kind: 'pop'; building: BuildingId; artifactId: string; artifactKind: ArtifactKind }
  | { kind: 'stamp'; artifactId: string; verdict: 'accept' | 'revise' }
  | { kind: 'freeze'; on: boolean }
  | { kind: 'celebrate'; agents: AgentId[] }
  | { kind: 'receive'; agent: AgentId; artifactId: string };

const BUILDING: Record<AgentId, BuildingId> = { mayor: 'hall', scout: 'library', maker: 'workshop', herald: 'post', founder: 'home' };
const COLOR: Record<AgentId, string> = { mayor: '#F2B544', scout: '#3FB8AF', maker: '#FF6B5A', herald: '#8C6CF2', founder: '#F6EFE1' };

export function deriveCues(prev: TownState, e: EventEnvelope): Cue[] {
  switch (e.type) {
    case 'run.created': return [{ kind: 'bubble', agent: 'mayor', text: 'New business! Let me think…', priority: 2 }];
    case 'mayor.thinking': return [{ kind: 'glow', building: 'hall', on: true, color: COLOR.mayor }];
    case 'plan.proposed': return [{ kind: 'glow', building: 'hall', on: false, color: '' }, { kind: 'alert', building: 'hall', on: true, tone: 'question' }];
    case 'plan.approved': return [{ kind: 'alert', building: 'hall', on: false, tone: 'question' }, { kind: 'walk', agent: 'founder', to: 'hall' }, { kind: 'bubble', agent: 'founder', text: 'Approved.', priority: 4 }, { kind: 'walk', agent: 'founder', to: 'home' }];
    case 'handoff': {
      const { from, to, artifactId, summary } = e.data;
      if (from === to) return [{ kind: 'bubble', agent: from, text: summary, priority: 3 }];
      return [
        { kind: 'exit', agent: from, building: BUILDING[from] },
        { kind: 'walk', agent: from, to: BUILDING[to], carrying: { artifactId, kind: prev.artifacts[artifactId]?.kind ?? 'research' } },
        { kind: 'bubble', agent: from, text: summary, priority: 3 },
        { kind: 'receive', agent: to, artifactId },
        { kind: 'walk', agent: from, to: BUILDING[from] },
        { kind: 'enter', agent: from, building: BUILDING[from] },
      ];
    }
    case 'task.dispatched': return [
      { kind: 'alert', building: BUILDING[e.data.agent], on: false, tone: 'error' },
      { kind: 'walk', agent: e.data.agent, to: BUILDING[e.data.agent] },
      { kind: 'enter', agent: e.data.agent, building: BUILDING[e.data.agent] },
    ];
    case 'task.started': return [{ kind: 'glow', building: BUILDING[e.data.agent], on: true, color: COLOR[e.data.agent] }];
    case 'agent.tool': return [{ kind: 'bubble', agent: e.data.agent, text: e.data.label, priority: 2 }];
    case 'agent.say': return [{ kind: 'bubble', agent: e.data.agent, text: e.data.text, priority: 1 }];
    case 'artifact.created': return [{ kind: 'glow', building: BUILDING[e.data.artifact.agent], on: false, color: '' }, { kind: 'pop', building: BUILDING[e.data.artifact.agent], artifactId: e.data.artifact.id, artifactKind: e.data.artifact.kind }];
    case 'review.verdict': {
      const cues: Cue[] = [{ kind: 'glow', building: 'hall', on: false, color: '' }, { kind: 'stamp', artifactId: e.data.artifactId, verdict: e.data.verdict }];
      if (e.data.verdict === 'revise') cues.push({ kind: 'bubble', agent: 'mayor', text: e.data.note, priority: 3 });
      return cues;
    }
    case 'task.revising': {
      const task = prev.tasks[e.data.taskId];
      return task ? [{ kind: 'glow', building: BUILDING[task.def.owner], on: true, color: COLOR[task.def.owner] }] : [];
    }
    case 'task.failed': {
      const task = prev.tasks[e.data.taskId];
      return task ? [{ kind: 'alert', building: BUILDING[task.def.owner], on: true, tone: 'error' }, { kind: 'bubble', agent: task.def.owner, text: e.data.error.message, priority: 3 }] : [];
    }
    case 'founder.redirect': return [{ kind: 'walk', agent: 'founder', to: BUILDING[e.data.agent] }, { kind: 'bubble', agent: 'founder', text: e.data.note, priority: 4 }, { kind: 'walk', agent: 'founder', to: 'home' }];
    case 'founder.question': return [{ kind: 'alert', building: 'hall', on: true, tone: 'question' }, { kind: 'bubble', agent: 'mayor', text: e.data.text, priority: 4 }];
    case 'run.paused': return [{ kind: 'freeze', on: true }];
    case 'run.resumed': return [{ kind: 'freeze', on: false }];
    case 'task.skipped': {
      const task = prev.tasks[e.data.taskId];
      return task ? [{ kind: 'alert', building: BUILDING[task.def.owner], on: false, tone: 'error' }, { kind: 'bubble', agent: task.def.owner, text: `Skipped: ${e.data.reason}`, priority: 3 }] : [];
    }
    case 'brief.ready': return [{ kind: 'glow', building: 'hall', on: false, color: '' }];
    case 'run.completed': return [
      ...(['hall', 'library', 'workshop', 'post', 'home', 'plaza'] as BuildingId[]).map((building) => ({ kind: 'glow' as const, building, on: false, color: '' })),
      ...(['scout', 'maker', 'herald'] as DeptId[]).map((agent) => ({ kind: 'walk' as const, agent, to: 'plaza' as const })),
      { kind: 'celebrate', agents: ['mayor', 'scout', 'maker', 'herald', 'founder'] },
    ];
    default: return [];
  }
}
