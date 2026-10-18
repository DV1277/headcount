import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSnapshot } from './snapshot';
import { dockFor } from './routing';
import type { EventEnvelope } from '@hc/contracts';

const FIXTURES = (name: string) =>
  resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'fixtures', 'runs', name);

const load = (name: string): EventEnvelope[] =>
  readFileSync(FIXTURES(name), 'utf8').trim().split('\n').map((line) => JSON.parse(line) as EventEnvelope);

export const fixtureNames = ['golden-boba.jsonl', 'failure-retry.jsonl', 'redirect.jsonl'];

const GOLDEN = load('golden-boba.jsonl');

describe('reduced-state snapshot over replay fixtures', () => {
  it('full replays cover every town cue kind', () => {
    const covered = new Set<string>();
    for (const name of fixtureNames) {
      const events = load(name);
      for (const kind of buildSnapshot(events, events[events.length - 1].t).kinds) covered.add(kind);
    }
    for (const kind of ['bubble', 'glow', 'alert', 'walk', 'enter', 'exit', 'receive', 'pop', 'stamp', 'freeze', 'celebrate']) {
      expect(covered, `${kind} cue expected across fixtures`).toContain(kind);
    }
  });

  it('handoff envelopes reach their receivers', () => {
    for (const name of fixtureNames) {
      const events = load(name);
      const snapshot = buildSnapshot(events, events[events.length - 1].t);
      for (const event of events) {
        if (event.type !== 'handoff') continue;
        const artifactId = String((event.data as { artifactId?: string }).artifactId ?? '');
        const to = String((event.data as { to?: string }).to ?? '');
        expect(snapshot.received.some((entry) => entry.artifactId === artifactId && entry.agent === to),
          `${name}: handoff ${artifactId} -> ${to} must be marked received`).toBe(true);
      }
    }
  });

  it('residents leave their buildings to celebrate at the golden finish', () => {
    const snapshot = buildSnapshot(GOLDEN, GOLDEN[GOLDEN.length - 1].t);
    expect(snapshot.agents.scout.inside).toBe(false);
    expect(snapshot.agents.scout.tile).toEqual(dockFor('plaza', 'scout'));
    // Golden-boba celebrates at completion.
    expect(snapshot.celebrating).toBe(true);
    expect(snapshot.frozen).toBe(false);
    expect(Object.keys(snapshot.buildings)).toEqual(['hall', 'library', 'workshop', 'post', 'home']);
    expect(snapshot.progress).toBeGreaterThan(0);
    expect(snapshot.progress).toBeLessThanOrEqual(1);
  });

  it('current deliverables replace drafts and completed revisions carry accepted stamps', () => {
    const snapshot = buildSnapshot(GOLDEN, GOLDEN[GOLDEN.length - 1].t);
    expect(snapshot.items.length).toBe(4);
    expect(snapshot.items.some((item) => item.artifactId === 'a_site')).toBe(false);
    expect(snapshot.items.find((item) => item.artifactId === 'a_site_v2')?.verdict).toBe('accept');
    expect(snapshot.items.filter((item) => item.verdict === 'accept')).toHaveLength(3);
    expect(new Set(snapshot.items.map((item) => item.slot)).size).toBe(snapshot.items.length);
    for (const item of snapshot.items) {
      expect(item.verdict === undefined || item.verdict === 'accept' || item.verdict === 'revise').toBe(true);
    }
  });

  it('the captured CREAO run finishes with three accepted outputs and no obsolete red stamps', () => {
    const events = load('live-boba-g2.jsonl');
    const snapshot = buildSnapshot(events, events[events.length - 1].t);
    expect(snapshot.items).toHaveLength(4);
    expect(snapshot.items.filter((item) => item.verdict === 'accept')).toHaveLength(3);
    expect(snapshot.items.some((item) => item.verdict === 'revise')).toBe(false);
  });

  it('scrub prefixes equal the full-replay snapshot for the same clock', () => {
    const events = load('failure-retry.jsonl');
    for (const t of [5000, 30_000, 80_000, events[events.length - 1].t]) {
      const full = buildSnapshot(events, t);
      const scrubbed = buildSnapshot(events.filter((event) => event.t <= t), t);
      expect(JSON.stringify(scrubbed)).toBe(JSON.stringify(full));
      expect(JSON.stringify(buildSnapshot(events, t))).toBe(JSON.stringify(full));
    }
  });

  it('right after run.created nobody is inside, frozen or receiving', () => {
    for (const name of fixtureNames) {
      const events = load(name);
      expect(events[0].type).toBe('run.created');
      const before = buildSnapshot(events, events[0].t);
      expect(before.frozen).toBe(false);
      expect(before.celebrating).toBe(false);
      expect(before.received).toEqual([]);
      expect(Object.values(before.agents).every((agent) => !agent.inside)).toBe(true);
    }
  });
});
