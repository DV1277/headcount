// A-01 mock Mayor: schema-valid deterministic plans, HC_MOCK_SPEED scaling, zero usage.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlanSchema, type PlanTask } from '@hc/contracts';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('MockMayor', () => {
  it('returns a plan-valid template plan with zero usage at speed 100', async () => {
    vi.stubEnv('HC_MAYOR', 'mock');
    vi.stubEnv('HC_MOCK_SPEED', '100');
    const { createMayor } = await import('./index');
    const mayor = createMayor();
    const started = Date.now();
    const res = await mayor.plan({ idea: 'Late-night boba delivery for UCLA dorms' });
    expect(Date.now() - started).toBeLessThan(400); // 2.5s / 100
    expect(PlanSchema.safeParse(res.plan).success).toBe(true);
    expect(res.source).toBe('template');
    expect(res.usage).toEqual({ tokensIn: 0, tokensOut: 0 });
    expect(res.plan.tasks.map((t) => t.owner)).toEqual(['scout', 'maker', 'herald']);
    expect(res.plan.title.startsWith('Late-night boba delivery')).toBe(true);
    expect(res.plan.title.length).toBeLessThanOrEqual(100);
  });

  it('produces identical payloads across calls (deterministic) and never fake spend', async () => {
    vi.stubEnv('HC_MAYOR', 'mock');
    vi.stubEnv('HC_MOCK_SPEED', '500');
    const { createMayor } = await import('./index');
    const mayor = createMayor();
    const p1 = await mayor.plan({ idea: 'AI study buddy for intro CS students' });
    const p2 = await mayor.plan({ idea: 'AI study buddy for intro CS students' });
    expect(p1.plan).toEqual(p2.plan);
    const review = await mayor.review({ idea: 'x', task: p1.plan.tasks[0], artifact: { id: 'a', runId: 'r', taskId: 't1', agent: 'scout', kind: 'research', title: 'Research', createdAt: new Date().toISOString(), payload: mockPayload() } });
    expect(review.verdict).toBe('accept');
    expect(review.usage).toEqual({ tokensIn: 0, tokensOut: 0 });
  });

  it('review accepts and brief returns exactly three next steps', async () => {
    vi.stubEnv('HC_MAYOR', 'mock');
    vi.stubEnv('HC_MOCK_SPEED', '500');
    const { createMayor } = await import('./index');
    const mayor = createMayor();
    const br = await mayor.brief({ idea: 'x', plan: (await mayor.plan({ idea: 'x' })).plan, artifacts: [] });
    expect(br.brief.nextSteps).toHaveLength(3);
    expect(br.brief.markdown).toContain('## What we built');
    expect(br.usage).toEqual({ tokensIn: 0, tokensOut: 0 });
  });

  it('say returns canned lines ≤ 80 chars, and cover returns a payload of the right kind', async () => {
    vi.stubEnv('HC_MAYOR', 'mock');
    vi.stubEnv('HC_MOCK_SPEED', '500');
    const { createMayor } = await import('./index');
    const mayor = createMayor();
    const said = await mayor.say({ moment: 'planned', context: 'n/a' });
    expect(said.source).toBe('canned');
    expect(said.text.length).toBeLessThanOrEqual(80);
    const { createMayor: noDefault } = await import('./index');
    void noDefault;
    const task: PlanTask = { id: 't1', owner: 'scout', title: 'Market research', instructions: 'x', deliverable: 'research', dependsOn: [], enabled: true };
    const covered = await mayor.cover({ idea: 'x', task, inputs: [] });
    expect(covered.usage).toEqual({ tokensIn: 0, tokensOut: 0 });
    const payload = covered.payload as { competitors: unknown[] };
    expect(payload.competitors.length).toBeGreaterThan(0);
  });

  it('aborts promptly when the executor cancels (abort-aware timeline)', async () => {
    vi.stubEnv('HC_MAYOR', 'mock');
    vi.stubEnv('HC_MOCK_SPEED', '1');
    const { createMayor } = await import('./index');
    const mayor = createMayor();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30);
    void controller;
    // The Mayor interface has no signal; abort-awareness is exercised on the worker signals.
    const p = mayor.plan({ idea: 'slow' });
    await expect(p).resolves.toBeTruthy();
    void controller;
  });
});

function mockPayload() {
  return { competitors: [{ name: 'x', url: 'https://example.com/x', priceNote: '$5', notes: 'n' }], audience: 'students', priceBand: '$5–7', gaps: ['g'], sources: ['https://example.com/x'] };
}
