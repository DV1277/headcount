// A-01 mock worker: fixture payloads, HC_MOCK_SPEED scaling, mid-run abort, zero credits.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArtifactSchemas } from '@hc/contracts';
import { MockWorker } from './mock';
import type { WorkerInput } from './index';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

function inputFor(owner: 'scout' | 'maker' | 'herald'): WorkerInput {
  const deliverable = owner === 'scout' ? 'research' : owner === 'maker' ? 'site' : 'launch_kit';
  return {
    runId: 'run_test',
    task: {
      id: owner === 'scout' ? 't1' : owner === 'maker' ? 't2' : 't3',
      owner,
      title: 'x',
      instructions: 'do the thing',
      deliverable,
      dependsOn: owner === 'scout' ? [] : ['t1'],
      enabled: true,
    },
    idea: 'Late-night boba delivery for UCLA dorms',
    inputs: [],
    founderNotes: ['keep it cheap'],
    siteUrl: 'http://127.0.0.1:8788/run_test',
  };
}

describe('MockWorker', () => {
  it('returns the dept payload inside a fenced code block with zero credits', async () => {
    vi.stubEnv('HC_MOCK_SPEED', '100'); // 40–50 s base → ~0.4–0.5 s wall
    for (const owner of ['scout', 'maker', 'herald'] as const) {
      const events: string[] = [];
      const res = await new MockWorker().run(inputFor(owner), (e) => events.push(e.kind), new AbortController().signal);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.credits).toBe(0);
        expect(res.via).toBe('mock');
        const fenced = /^```json\n([\s\S]*)\n```$/.exec(res.raw)?.[1] ?? '';
        expect(JSON.parse(fenced) as unknown).toEqual(res.payload);
        const kind = owner === 'scout' ? 'research' : owner === 'maker' ? 'site' : 'launch_kit';
        expect(ArtifactSchemas[kind].safeParse(res.payload).success).toBe(true);
      }
      expect(events[0]).toBe('started');
      expect(events.length).toBeGreaterThan(1); // started + tool/progress kicks
    }
  });

  it('scales every delay by HC_MOCK_SPEED (10× faster than base, still paced)', async () => {
    vi.stubEnv('HC_MOCK_SPEED', '50');
    const t0 = Date.now();
    await new MockWorker().run(inputFor('scout'), () => {}, new AbortController().signal);
    const wall = Date.now() - t0; // base 40 s → expect 800 ms (±400 ms of scheduling slack)
    expect(wall).toBeGreaterThan(300);
    expect(wall).toBeLessThan(1900);
  });

  it('substitutes __SITE_URL__ deterministically for maker and herald payloads', async () => {
    vi.stubEnv('HC_MOCK_SPEED', '100');
    const worker = new MockWorker();
    for (const owner of ['maker', 'herald'] as const) {
      const res = await worker.run(inputFor(owner), () => {}, new AbortController().signal);
      if (res.ok) {
        const needle = JSON.stringify(res.payload);
        expect(needle).toContain('http://127.0.0.1:8788/run_test');
        expect(needle).not.toContain('__SITE_URL__');
      }
    }
    const a = await worker.run(inputFor('maker'), () => {}, new AbortController().signal);
    const b = await worker.run(inputFor('maker'), () => {}, new AbortController().signal);
    expect(a).toEqual(b); // deterministic across runs
  });

  it('returns cancelled (not retryable) when the executor aborts mid-run', async () => {
    vi.stubEnv('HC_MOCK_SPEED', '1'); // full ~40 s scout run
    const controller = new AbortController();
    const p = new MockWorker().run(inputFor('scout'), () => {}, controller.signal);
    setTimeout(() => controller.abort(), 400);
    const res = await p;
    expect(res).toMatchObject({ ok: false, error: { code: 'cancelled' }, retryable: false });
  });
});
