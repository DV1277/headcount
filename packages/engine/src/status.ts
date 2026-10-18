import type { TownState } from './state.js';
import { ROSTER } from '@hc/contracts';
export function statusLine(s: TownState): string {
  if (s.status === 'awaiting_approval') return 'Mayor has a plan ready for your approval.';
  if (s.status === 'awaiting_founder') return 'Mayor needs your answer.';
  if (s.status === 'paused') return 'Run paused.';
  if (s.status === 'finishing') return 'The team is preparing your founder brief.';
  if (s.status === 'completed') return `Run complete · ${Math.round(s.progress * 100)}% of tasks accepted.`;
  if (s.status === 'failed') return 'Run failed. Review the log to see what happened.';
  const active = Object.values(s.tasks).find((task) => ['working', 'dispatched', 'covered', 'revising'].includes(task.status));
  if (active) return `${ROSTER[active.def.owner].name} · ${active.def.title}`;
  return s.status === 'running' ? 'Team is ready for work.' : 'Mayor is planning your company.';
}
