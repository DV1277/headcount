import type { AgentId, BuildingId } from '@hc/contracts';

// Pure policies shared by the live cue player, the reduced-state snap builder
// and the test suite. All scene-ephemeral display logic depends on these.

// --- Speech bubbles (§8.5, HC-F-082) -----------------------------------------

export const BUBBLE_LIMIT = 2;           // max visible town-wide
export const BUBBLE_MAX_CHARS = 80;      // truncate with ellipsis
export const BUBBLE_HOLD_MS = 3200;      // 3.2 s hold
export const BUBBLE_IN_MS = 140;         // pop-in 0.8 → 1.0
export const BUBBLE_OUT_MS = 200;        // fade out

export type BubblePriority = 1 | 2 | 3 | 4; // 4 = founder-facing > handoff > tool > flavor
export type BubbleEntry = { id: number; agent: AgentId; text: string; priority: BubblePriority };

/** ≤ 80 chars, cut on an ellipsis. (Space-collapsed for pixel overflow safety.) */
export function truncateText(text: string, max: number = BUBBLE_MAX_CHARS): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export type BubbleAdmission<T extends BubbleEntry> = {
  kept: T[];            // still-visible entries after the admission decision
  admitted: T | null;   // the incoming entry if it made it on screen
  evicted: T[];         // entries that left because of the incoming one
};

/**
 * Max two bubbles town-wide. A newcomer evicts the lowest-priority oldest
 * bubble only when it outranks it; lower-priority newcomers are dropped so a
 * founder-facing note always wins over flavor.
 */
export function admitBubble<T extends BubbleEntry>(visible: readonly T[], incoming: T): BubbleAdmission<T> {
  if (visible.length < BUBBLE_LIMIT) return { kept: [...visible, incoming], admitted: incoming, evicted: [] };
  const weakest = [...visible].sort((a, b) => (a.priority - b.priority) || (a.id - b.id))[0];
  if (incoming.priority > weakest.priority) {
    const evicted = visible.filter((entry) => entry.id === weakest.id);
    const kept = visible.filter((entry) => entry.id !== weakest.id).concat(incoming);
    return { kept, admitted: incoming, evicted };
  }
  return { kept: [...visible], admitted: null, evicted: [] };
}

// --- Walk queues (§8.5 / HC-F-081) -------------------------------------------

export const WALK_QUEUE_FAST_FORWARD = 6; // more than 6 queued plain walks → teleport with a puff

export type QueuedWalk = { k: 'walk'; carrying?: unknown };

export function countWalks(candidates: readonly unknown[]): number {
  return candidates.filter((job) => (job as QueuedWalk).k === 'walk').length;
}

/**
 * Fast-forward rule: once more than `6` walks queue up for one agent, plain
 * walks teleport (with a puff). A walk with `carrying` set is *never* skipped.
 *
 * `walksAhead` counts the walk starting at the FIFO front and all queued walks.
 * Call only when starting that front job, never while another walk is active.
 */
export function shouldFastForward(walksAhead: number, carrying: boolean): boolean {
  return walksAhead > WALK_QUEUE_FAST_FORWARD && !carrying;
}

export function isWalkCue(cue: { kind: string }): boolean {
  return cue.kind === 'walk' || cue.kind === 'enter' || cue.kind === 'exit' || cue.kind === 'receive';
}

// --- Building states (§8.5 events, HC-F-083) ---------------------------------

export type BuildingFxState = { glow?: string; alert?: 'question' | 'error' };
export const FX_BUILDINGS: readonly Exclude<BuildingId, 'plaza'>[] = ['hall', 'library', 'workshop', 'post', 'home'];

export function fxStateIsOn(fx: BuildingFxState): boolean {
  return Boolean(fx.glow) || Boolean(fx.alert);
}

export type AgentMotion = 'idle' | 'walking' | 'working' | 'waiting' | 'blocked' | 'paused';

/** Calm word for hover tags; falls back to a friendly default. */
export function motionWord(status: string | undefined): string {
  switch (status) {
    case 'walking': return 'on the way';
    case 'working': return 'working';
    case 'waiting': return 'waiting on a teammate';
    case 'blocked': return 'blocked';
    case 'paused': return 'paused';
    case 'idle': return 'idle';
    default: return 'around town';
  }
}
