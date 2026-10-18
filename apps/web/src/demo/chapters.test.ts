import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EventEnvelope } from '@hc/contracts';
import { initialState, reduce } from '@hc/engine';
import { buildDemoChapters, type DemoChapter } from './chapters';

const fixture = (name: string): EventEnvelope[] =>
  readFileSync(new URL(`../../../../fixtures/runs/${name}.jsonl`, import.meta.url), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as EventEnvelope);

const liveBoba = (): EventEnvelope[] => fixture('live-boba-g2');

const knownArtifacts = (events: readonly EventEnvelope[]): Map<string, number> => {
  const known = new Map<string, number>();
  for (const e of events) {
    if (e.type === 'artifact.created' && !known.has(e.data.artifact.id)) {
      known.set(e.data.artifact.id, e.t);
    }
  }
  return known;
};

const expectMonotonic = (chapters: DemoChapter[]): void => {
  for (let i = 1; i < chapters.length; i += 1) {
    expect(chapters[i].t).toBeGreaterThan(chapters[i - 1].t);
  }
};

describe('buildDemoChapters on the real live-boba-g2 recording', () => {
  it('reaches the completed state before stopping at the final QR', () => {
    const events=liveBoba();
    const finale=buildDemoChapters(events).at(-1)!;
    const state=events.filter(e=>e.t<=finale.t).reduce(reduce,initialState());
    expect(state.status).toBe('completed');
    expect(state.artifacts[finale.artifactId!].kind).toBe('brief');
  });

  it('shows both actual handoffs and both started workers at their chapters', () => {
    const events=liveBoba(), chapters=buildDemoChapters(events);
    const at=(id:string)=>events.filter(e=>e.t<=chapters.find(c=>c.id===id)!.t).reduce(reduce,initialState());
    expect(at('handoffs').handoffs).toHaveLength(2);
    expect(at('parallel-build').tasks.t2.status).toBe('working');
    expect(at('parallel-build').tasks.t3.status).toBe('working');
  });
  it('derives 12-15 monotonic chapters from typed events', () => {
    const events = liveBoba();
    const chapters = buildDemoChapters(events);
    expect(chapters.length).toBeGreaterThanOrEqual(12);
    expect(chapters.length).toBeLessThanOrEqual(15);
    expectMonotonic(chapters);
  });

  it('opens at t0 in town with holdMs 0 and closes in final with holdMs 0', () => {
    const chapters = buildDemoChapters(liveBoba());
    const [first] = chapters;
    const last = chapters[chapters.length - 1];
    expect(first.id).toBe('opening');
    expect(first.t).toBe(0);
    expect(first.view).toBe('town');
    expect(first.holdMs).toBe(0);
    expect(last.id).toBe('founder-brief');
    expect(last.view).toBe('final');
    expect(last.holdMs).toBe(0);
  });

  it('orders mayor planning shortly after 0 and the plan before approval', () => {
    const byId = new Map(buildDemoChapters(liveBoba()).map((c) => [c.id, c]));
    const planning = byId.get('mayor-planning')!;
    const proposed = byId.get('plan-proposed')!;
    const approved = byId.get('plan-approved')!;
    expect(planning.t).toBeGreaterThan(0);
    expect(proposed.t).toBeGreaterThan(planning.t);
    expect(approved.t).toBeGreaterThan(proposed.t);
    expect(proposed.view).toBe('plan');
  });

  it('covers the tour arc with the required views', () => {
    const chapters = buildDemoChapters(liveBoba());
    const views = chapters.map((c) => c.view);
    for (const view of ['town', 'plan', 'agent', 'research', 'org', 'logs', 'site', 'launch', 'final'] as const) {
      expect(views).toContain(view);
    }
  });

  it('references only artifacts that already exist at each chapter time', () => {
    const events = liveBoba();
    const known = knownArtifacts(events);
    for (const chapter of buildDemoChapters(events)) {
      if (chapter.artifactId === undefined) continue;
      expect(known.has(chapter.artifactId)).toBe(true);
      expect(known.get(chapter.artifactId)!).toBeLessThanOrEqual(chapter.t);
    }
  });

  it('uses the accepted research, final site, launch kit, and brief artifact IDs', () => {
    const events = liveBoba();
    const completedByTask = new Map<string, string>();
    for (const e of events) {
      if (e.type === 'task.completed') completedByTask.set(e.data.taskId, e.data.artifactId);
    }
    const briefReady = events.find((e) => e.type === 'brief.ready');
    const chapters = new Map(buildDemoChapters(events).map((c) => [c.id, c]));
    expect(chapters.get('research-accepted')?.artifactId).toBe(completedByTask.get('t1'));
    expect(chapters.get('site-accepted')?.artifactId).toBe(completedByTask.get('t2'));
    expect(chapters.get('launch-accepted')?.artifactId).toBe(completedByTask.get('t3'));
    expect(briefReady).toBeDefined();
    expect(chapters.get('founder-brief')?.artifactId).toBe(
      briefReady?.type === 'brief.ready' ? briefReady.data.artifactId : undefined,
    );
  });

  it('holds 3-6s on middle chapters and never names hardcoded private traces', () => {
    const chapters = buildDemoChapters(liveBoba());
    for (const chapter of chapters.slice(1, -1)) {
      expect(chapter.holdMs).toBeGreaterThanOrEqual(3000);
      expect(chapter.holdMs).toBeLessThanOrEqual(6000);
    }
    const blob = JSON.stringify(chapters).toLowerCase();
    expect(blob).not.toContain('browser');
    expect(blob).not.toContain('reasoning');
  });

  it('orders scout before handoffs, parallel work, and the finale', () => {
    const byId = new Map(buildDemoChapters(liveBoba()).map((c) => [c.id, c]));
    const scout = byId.get('scout-research')!.t;
    for (const id of ['handoffs', 'parallel-build', 'site-accepted', 'launch-accepted', 'founder-brief'] as const) {
      expect(byId.get(id)!.t).toBeGreaterThan(scout);
    }
    expect(byId.get('handoffs')!.t).toBeLessThanOrEqual(byId.get('parallel-build')!.t);
  });

  it('does not mutate the input events', () => {
    const events = liveBoba();
    const before = JSON.stringify(events);
    buildDemoChapters(events);
    expect(JSON.stringify(events)).toBe(before);
    expect(events).toHaveLength(135);
  });
});

describe('buildDemoChapters graceful degradation', () => {
  it('returns an empty tour for empty input and stays graceful on other fixtures', () => {
    expect(buildDemoChapters([])).toEqual([]);
    for (const name of ['golden-boba', 'redirect', 'failure-retry']) {
      const events = fixture(name);
      const chapters = buildDemoChapters(events);
      expect(chapters.length).toBeGreaterThan(0);
      expectMonotonic(chapters);
      const known = knownArtifacts(events);
      for (const chapter of chapters) {
        if (chapter.artifactId === undefined) continue;
        expect(known.has(chapter.artifactId)).toBe(true);
        expect(known.get(chapter.artifactId)!).toBeLessThanOrEqual(chapter.t);
      }
    }
  });

  it('handles an incomplete run without inventing artifacts', () => {
    const events = liveBoba().slice(0, 8);
    const chapters = buildDemoChapters(events);
    expect(chapters.length).toBeGreaterThan(0);
    expect(chapters[0].id).toBe('opening');
    expectMonotonic(chapters);
    const known = knownArtifacts(events);
    for (const chapter of chapters) {
      if (chapter.artifactId === undefined) continue;
      expect(known.has(chapter.artifactId)).toBe(true);
    }
  });
});
