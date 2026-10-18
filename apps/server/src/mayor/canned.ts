// Human-facing fallback lines and text vetting for Mayor.say (≤ 80 chars, HC-F-025).

import type { Artifact, PlanTask } from '@hc/contracts';

export type SayMoment = 'planned' | 'approved' | 'handoff' | 'accepted' | 'completed';

export const CANNED_SAY: Record<SayMoment, string> = {
  planned: 'Plan is ready for your approval.',
  approved: 'On it. Dispatching the teams.',
  handoff: 'Deliverable handed off — next desk picked it up.',
  accepted: 'Accepted. Logged for payroll.',
  completed: 'All done, founder. See the brief.',
};

export const SAY_INTERVAL_MS = 8_000;
export const SAY_MAX_CHARS = 80;

/** Vet a model line: first line only, trim quotes, hard cap at 80 chars. */
export function vetSay(text: string): string {
  const line = (text.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '').replace(/^["'\s]+|["'\s]+$/g, '');
  return line.slice(0, SAY_MAX_CHARS);
}

/** Guard against oversized artifacts in prompts; keeps costs bounded. */
export function artifactHeadline(artifact: Artifact): string {
  const title = artifact.title ?? artifact.kind;
  return `${artifact.kind} · ${title}`;
}

/** One-line human summary of a task for prompts. */
export function taskLine(task: PlanTask): string {
  return `${task.id} (${task.owner}, ${task.deliverable}): ${task.title} — ${task.instructions}`;
}
