// Worker role inputs (A-06, §11.3): Scout gets {task, idea, founderNotes[]}; Maker/Herald get the
// research artifact, the deterministic site URL and founderNotes. Input shape matches
// agents/creao/*.md exactly (one JSON object per run).
import type { Artifact, DeptId, PlanTask, ResearchPayload } from '@hc/contracts';

export type RoleInput = Record<string, unknown>;

/** Deliverable kinds a CREAO saved agent produces (brief is Mayor-only). */
export const roleKinds = ['research', 'site', 'launch_kit'] as const;

export function deptOf(task: PlanTask): DeptId {
  return task.owner;
}

export function researchArtifactOf(inputs: Artifact[]): ResearchPayload | null {
  const research = inputs.find((a) => a.kind === 'research' && a.payload && typeof a.payload === 'object');
  if (!research) return null;
  const payload = research.payload as ResearchPayload;
  return 'competitors' in payload && 'audience' in payload ? payload : null;
}

/** Deterministic site URL for a run (AC composer rule): PUBLIC_BASE_URL when set, else localhost. */
export function deterministicSiteUrl(runId: string): string {
  const base = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (base) return `${base}/sites/${runId}/`;
  const port = (process.env.HC_SITES_PORT || '8788').trim();
  return `http://127.0.0.1:${port}/sites/${runId}/`;
}

/**
 * Build the JSON object sent to a saved agent (one object per run, matching agents/creao/*.md
 * AND HEAD's CREAO form fields, task card §18). `founderNotes` and `dependsOn` are textarea JSON
 * (JSON stringified); for Maker/Herald `research` is textarea JSON too (`"null"` when Scout was
 * skipped — never fabricate). The canonical nested `task` object rides along for account-mode
 * agents, which parse JSON strings fine.
 */
export function buildRoleInput(tr: { task: PlanTask; idea: string; inputs: Artifact[]; founderNotes: string[]; siteUrl: string }, mode: 'app'|'account' = 'app'): RoleInput {
  const task = {
    id: tr.task.id, owner: tr.task.owner, title: tr.task.title, instructions: tr.task.instructions,
    deliverable: tr.task.deliverable, dependsOn: tr.task.dependsOn, enabled: tr.task.enabled,
  };
  const founderNotes = tr.founderNotes.filter((n) => typeof n === 'string').slice(0, 8);
  if (mode === 'account') return tr.task.owner === 'scout'
    ? { task, idea: tr.idea, founderNotes }
    : { task, idea: tr.idea, founderNotes, research: researchArtifactOf(tr.inputs), siteUrl: tr.siteUrl };
  const notes = JSON.stringify(founderNotes);
  const common: RoleInput = {
    idea: tr.idea,
    taskTitle: tr.task.title,
    taskInstructions: tr.task.instructions,
    taskId: tr.task.id,
    dependsOn: JSON.stringify(tr.task.dependsOn),
    taskEnabled: tr.task.enabled,
    founderNotes: notes,
  };
  if (tr.task.owner === 'scout') return { task, ...common };
  const research = researchArtifactOf(tr.inputs);
  return { task, ...common, research: JSON.stringify(research), siteUrl: tr.siteUrl };
}
