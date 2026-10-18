import { deriveCues, initialState, reduce, type Cue } from '@hc/engine';
import type { AgentId, ArtifactKind, BuildingId, EventEnvelope } from '@hc/contracts';
import { FX_BUILDINGS, type BuildingFxState } from './policies';
import { dockFor } from './routing';
import type { TownPoint } from './map';
import { HALL_STEP_SLOTS, SIM_SPAWN_POINTS } from './map';

// Pure "instant cue" snapshot builder. The append-only log is the only source of
// truth: for any clock `t`, we replay the derived cue sequence with zero timers
// (walks teleport, enters/exits settle) so that load, seek, reconnect and
// back-to-live all snap to the same deterministic reduced visual state.

export type SnapshotItem = { artifactId: string; kind: ArtifactKind; slot: number; verdict?: 'accept' | 'revise' };

export type SimSnapshot = {
  runId: string | null;
  t: number;
  agents: Record<AgentId, { tile: TownPoint; inside: boolean }>;
  buildings: Record<Exclude<BuildingId, 'plaza'>, BuildingFxState>;
  items: SnapshotItem[];
  received: { artifactId: string; agent: AgentId }[];
  frozen: boolean;
  celebrating: boolean;
  progress: number;
  agentStatus: Record<AgentId, string>;
  /** Cue kinds mapped by the fixtures (sorted, deduped) — test coverage aid. */
  kinds: string[];
};

type Builder = {
  agents: Record<AgentId, { tile: TownPoint; inside: boolean }>;
  buildings: Record<string, BuildingFxState>;
  items: SnapshotItem[];
  received: { artifactId: string; agent: AgentId }[];
  carrying: Partial<Record<AgentId, { artifactId: string; kind: ArtifactKind }>>;
  frozen: boolean;
  celebrating: boolean;
  slotCursor: number;
  seen: Set<string>;
};

function applyInstant(state: Builder, cue: Cue): void {
  switch (cue.kind) {
    case 'walk': {
      const agent = state.agents[cue.agent];
      agent.tile = dockFor(cue.to, cue.agent);
      agent.inside = false;
      if (cue.carrying) state.carrying[cue.agent] = cue.carrying;
      break;
    }
    case 'enter': {
      const agent = state.agents[cue.agent];
      agent.tile = dockFor(cue.building, cue.agent);
      agent.inside = true;
      break;
    }
    case 'exit': {
      const agent = state.agents[cue.agent];
      agent.tile = dockFor(cue.building, cue.agent);
      agent.inside = false;
      break;
    }
    // Bubbles are transient text; the snapshot has no speech state.
    case 'bubble':
      break;
    case 'glow': {
      if (cue.building === 'plaza') break;
      const fx = state.buildings[cue.building];
      if (cue.on && cue.color) fx.glow = cue.color;
      if (!cue.on) fx.glow = undefined;
      break;
    }
    case 'alert': {
      if (cue.building === 'plaza') break;
      const fx = state.buildings[cue.building];
      if (cue.on) fx.alert = cue.tone;
      else fx.alert = undefined;
      break;
    }
    case 'pop': {
      state.items = state.items.filter((item) => item.artifactId !== cue.artifactId);
      state.items.push({ artifactId: cue.artifactId, kind: cue.artifactKind, slot: state.slotCursor % HALL_STEP_SLOTS.length });
      state.slotCursor += 1;
      break;
    }
    case 'stamp': {
      const item = state.items.find((entry) => entry.artifactId === cue.artifactId);
      if (item) item.verdict = cue.verdict;
      break;
    }
    case 'receive': {
      state.received.push({ artifactId: cue.artifactId, agent: cue.agent });
      for (const [holder, cargo] of Object.entries(state.carrying)) {
        if (cargo?.artifactId === cue.artifactId) delete state.carrying[holder as AgentId];
      }
      break;
    }
    case 'freeze':
      state.frozen = cue.on;
      break;
    case 'celebrate':
      state.celebrating = true;
      break;
  }
  state.seen.add(cue.kind);
}

/**
 * Build the reduced visual state at clock `t` from the append-only event log.
 * Deterministic: `buildSnapshot(events, t)` deep-equals the same call on the
 * prefix of `events` up to `t`, which is what makes scrubbing snap cleanly.
 */
export function buildSnapshot(events: readonly EventEnvelope[], t: number): SimSnapshot {
  let prev = initialState();
  let runId: string | null = null;
  let lastSeq = 0;
  const state: Builder = {
    agents: Object.fromEntries(Object.entries(SIM_SPAWN_POINTS).map(([id, tile]) => [id, { tile, inside: false }])) as Builder['agents'],
    buildings: Object.fromEntries(FX_BUILDINGS.map((building) => [building, {}])) as Builder['buildings'],
    items: [],
    received: [],
    carrying: {},
    frozen: false,
    celebrating: false,
    slotCursor: 0,
    seen: new Set(),
  };

  for (const event of events) {
    if (event.t > t) continue;
    if (event.seq <= lastSeq) continue;
    if (runId === null) runId = event.runId;
    else if (event.runId !== runId) continue;
    lastSeq = event.seq;
    const cues = deriveCues(prev, event);
    prev = reduce(prev, event);
    for (const cue of cues) applyInstant(state, cue);
  }

  return {
    runId,
    t,
    agents: Object.fromEntries(Object.entries(state.agents).map(([agent, entry]) => [agent, { tile: entry.tile, inside: entry.inside }])) as SimSnapshot['agents'],
    buildings: Object.fromEntries(FX_BUILDINGS.map((building) => [building, state.buildings[building] ?? {}])) as SimSnapshot['buildings'],
    items: state.items.filter((item) => !prev.artifacts[item.artifactId]?.stale)
      .map((item, index) => ({ ...item, slot: index % HALL_STEP_SLOTS.length })),
    received: state.received,
    // Envelopes always resolve inside a handoff's own cue batch (receive is
    // part of it), so no carrying ever survives a reduced replay.
    frozen: state.frozen,
    celebrating: state.celebrating,
    progress: prev.progress,
    agentStatus: Object.fromEntries(Object.entries(prev.agents).map(([agent, entry]) => [agent, entry.status])) as SimSnapshot['agentStatus'],
    kinds: [...state.seen].sort(),
  };
}
