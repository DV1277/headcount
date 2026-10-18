// Deterministic mock workers (A-01, HC-F-046): fixture payloads, realistic delays divided by
// HC_MOCK_SPEED, abort-aware. Credits stay 0 — a mock run performs no CREAO calls, and zero is a
// fact rather than synthetic spend (A-01 hard rule).
import type { DeptId, PlanTask } from '@hc/contracts';
import { mockDelay, sleepScaled } from '../llm/mock-time';
import { deterministicSiteUrl } from './inputs';
import { mockPayloadFor, substituteSiteUrl, type RolePayload } from '../mayor/mock-payloads';
import type { Worker, WorkerEvent, WorkerInput, WorkerResult } from './index';

type RoleKind = 'research' | 'site' | 'launch_kit';

function guardKind(kind: string): RoleKind {
  return kind === 'research' || kind === 'site' || kind === 'launch_kit' ? kind : 'research';
}

const BASE_DELAY_MS: Record<DeptId, number> = { scout: 40_000, maker: 50_000, herald: 35_000 };

type Step = { at: number; ev: WorkerEvent };

function scheduleFor(task: PlanTask, totalMs: number): Step[] {
  const kicks = (owner: DeptId): Omit<Step, 'at'>[] => {
    switch (owner) {
      case 'scout':
        return [
          { ev: { kind: 'tool', tool: 'web_search', label: 'Searching: direct competitors' } },
          { ev: { kind: 'tool', tool: 'web_fetch', label: 'Opening a competitor page' } },
          { ev: { kind: 'tool', tool: 'web_search', label: 'Searching: pricing pages' } },
          { ev: { kind: 'tool', tool: 'web_fetch', label: 'Confirming a source URL' } },
        ];
      case 'maker':
        return [
          { ev: { kind: 'tool', tool: 'codegen', label: 'Drafting hero and palette' } },
          { ev: { kind: 'tool', tool: 'codegen', label: 'Building sections and pricing' } },
          { ev: { kind: 'tool', tool: 'codegen', label: 'Tightening the HTML bundle' } },
        ];
      case 'herald':
        return [
          { ev: { kind: 'tool', tool: 'write', label: 'Drafting launch posts' } },
          { ev: { kind: 'tool', tool: 'write', label: 'Writing outreach emails' } },
          { ev: { kind: 'tool', tool: 'write', label: 'Tightening copy limits' } },
        ];
    }
  };
  const fractions = [0.05, 0.35, 0.62, 0.85];
  const steps: Step[] = kicks(task.owner).map((s, i) => ({ at: Math.round(fractions[i] * totalMs), ev: s.ev }));
  const note = task.owner === 'scout' ? 'Scanning the market…' : task.owner === 'maker' ? 'Composing page sections…' : 'Drafting launch copy…';
  const cadence = mockDelay(10_000);
  for (let t = cadence; t < totalMs - 250; t += cadence) steps.push({ at: Math.round(t), ev: { kind: 'progress', note } });
  steps.sort((a, b) => a.at - b.at);
  return steps;
}

export class MockWorker implements Worker {
  async run(input: WorkerInput, onEvent: (e: WorkerEvent) => void, signal: AbortSignal): Promise<WorkerResult> {
    onEvent({ kind: 'started' });
    const t0 = Date.now();
    const total = mockDelay(BASE_DELAY_MS[input.task.owner]);
    for (const step of scheduleFor(input.task, total)) {
      const wait = step.at - (Date.now() - t0);
      if (wait > 0) await sleepScaled(wait, signal);
      if (signal.aborted) return { ok: false, error: { code: 'cancelled', message: 'aborted by executor during mock run' }, retryable: false };
      onEvent(step.ev);
    }
    const tail = total - (Date.now() - t0);
    if (tail > 0) await sleepScaled(tail, signal);
    if (signal.aborted) return { ok: false, error: { code: 'cancelled', message: 'aborted by executor during mock run' }, retryable: false };
    const payload = substituteSiteUrl(mockPayloadFor(guardKind(input.task.deliverable)), input.siteUrl || deterministicSiteUrl(input.runId)) as RolePayload;
    const raw = `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
    return { ok: true, payload, credits: 0, raw, via: 'mock' };
  }
}

export function mockWorkerDelayFor(task: PlanTask): number {
  return mockDelay(BASE_DELAY_MS[task.owner]);
}
