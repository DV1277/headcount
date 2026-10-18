// Plan validator rules (A-03): Sell-first DAG + schema gate.
import { describe, expect, it } from 'vitest';
import { validatePlan } from './validate';

const validPlan = {
  title: 'Boba after midnight',
  summary: 'Research Westwood boba demand, then build and launch.',
  questions: [] as string[],
  tasks: [
    { id: 't1', owner: 'scout', title: 'Market research', instructions: 'Find competitors and prices around UCLA.', deliverable: 'research', dependsOn: [] as string[], enabled: true },
    { id: 't2', owner: 'maker', title: 'Landing page', instructions: 'Build a page against the gaps.', deliverable: 'site', dependsOn: ['t1'], enabled: true },
    { id: 't3', owner: 'herald', title: 'Launch kit', instructions: 'Write posts and emails linking the site.', deliverable: 'launch_kit', dependsOn: ['t1'], enabled: true },
  ],
};

describe('validatePlan', () => {
  it('accepts the canonical Scout-first diamond', () => {
    expect(validatePlan(validPlan)).toMatchObject({ ok: true });
  });

  it('rejects a scout task with dependencies (research runs first)', () => {
    const plan = { ...validPlan, tasks: [...validPlan.tasks, { ...validPlan.tasks[0], id: 't4', dependsOn: ['t1'] }] };
    const res = validatePlan(plan);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues).toContain('t4: scout tasks must run first');
  });

  it('rejects a synth task depending on another synth task (forbidden synth-to-synth edge)', () => {
    const plan = { ...validPlan, tasks: [validPlan.tasks[0], validPlan.tasks[1], { ...validPlan.tasks[2], dependsOn: ['t2'] }] };
    const res = validatePlan(plan);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues).toContain('t3: herald tasks may only depend on Scout tasks (t2)');
  });

  it('rejects a synth task with no Scout dependency (would run without research)', () => {
    const plan = { ...validPlan, tasks: [validPlan.tasks[0], validPlan.tasks[1], { ...validPlan.tasks[2], owner: 'maker' as const, deliverable: 'site' as const, dependsOn: [] }] };
    const res = validatePlan(plan);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues).toContain('no Scout dependency');
  });

  it('rejects a plan with no enabled Scout task at all', () => {
    const plan = { ...validPlan, tasks: [{ ...validPlan.tasks[0], enabled: false }, ...validPlan.tasks.slice(1)] };
    const res = validatePlan(plan);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues).toContain('at least one enabled Scout task');
  });

  it('rejects duplicate task ids', () => {
    const plan = { ...validPlan, tasks: [...validPlan.tasks, validPlan.tasks[2]] };
    const res = validatePlan(plan);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues).toContain('Task IDs must be unique.');
  });

  it('rejects schema violations (wrong owner enum / missing enabled) with zod issues', () => {
    const plan = { ...validPlan, tasks: [{ ...validPlan.tasks[0], owner: 'mayor' }, ...validPlan.tasks.slice(1)] };
    const res = validatePlan(plan);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues).toContain('tasks.0.owner');
  });

  it('ignores rules for unticked tasks (founder choice, not a generated-plan bug)', () => {
    const plan = { ...validPlan, tasks: [validPlan.tasks[0], validPlan.tasks[1], { ...validPlan.tasks[2], dependsOn: ['t2'], enabled: false }] };
    expect(validatePlan(plan)).toMatchObject({ ok: true });
  });
});
