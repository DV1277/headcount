// A-06 input builders: deterministic site URL, Scout-first research artifact, honest nulls.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRoleInput, deterministicSiteUrl, deptOf, researchArtifactOf, roleKinds } from './inputs';
import type { Artifact, PlanTask } from '@hc/contracts';

afterEach(() => {
  vi.unstubAllEnvs();
});

const task = (owner: PlanTask['owner']): PlanTask => ({
  id: owner === 'scout' ? 't1' : owner === 'maker' ? 't2' : 't3',
  owner,
  title: 'x',
  instructions: 'do it',
  deliverable: owner === 'scout' ? 'research' : owner === 'maker' ? 'site' : 'launch_kit',
  dependsOn: [],
  enabled: true,
});

const research: ResearchArtifact = {
  id: 'a1', runId: 'run_x', taskId: 't1', agent: 'scout', kind: 'research', title: 'Research', createdAt: new Date().toISOString(),
  payload: {
    competitors: [{ name: 'A', url: 'https://example.com/a', priceNote: '$5', notes: 'n' }],
    audience: 'students', priceBand: '$5–8', gaps: ['g'], sources: ['https://example.com/a'],
  },
};
type ResearchArtifact = Artifact;

describe('deterministicSiteUrl', () => {
  it('defaults to localhost:8788 with a trailing slash', () => {
    expect(deterministicSiteUrl('run_x')).toBe('http://127.0.0.1:8788/sites/run_x/');
  });

  it('honors HC_SITES_PORT without a base URL', () => {
    vi.stubEnv('HC_SITES_PORT', '9911');
    expect(deterministicSiteUrl('run_x')).toBe('http://127.0.0.1:9911/sites/run_x/');
  });

  it('uses PUBLIC_BASE_URL with any trailing slashes trimmed', () => {
    vi.stubEnv('PUBLIC_BASE_URL', 'https://headcount.dev///');
    expect(deterministicSiteUrl('run_x')).toBe('https://headcount.dev/sites/run_x/');
  });
});

describe('buildRoleInput', () => {
  it('gives Scout task + textarea-JSON flat fields (no research, no siteUrl)', () => {
    const req = buildRoleInput({ task: task('scout'), idea: 'i', inputs: [research], founderNotes: ['g', 'd'], siteUrl: 'http://s' });
    expect(Object.keys(req).sort()).toEqual(['dependsOn', 'founderNotes', 'idea', 'task', 'taskEnabled', 'taskId', 'taskInstructions', 'taskTitle']);
    expect(req.taskTitle).toBe('x');
    expect(req.taskId).toBe('t1');
    expect(req.taskInstructions).toBe('do it');
    expect(req.dependsOn).toBe('[]');
    expect(req.taskEnabled).toBe(true);
    expect(JSON.parse(String(req.founderNotes))).toEqual(['g', 'd']);
  });

  it('gives Maker/Herald textarea-JSON research + siteUrl; research stays "null" when missing', () => {
    const req = buildRoleInput({ task: task('maker'), idea: 'i', inputs: [research], founderNotes: [], siteUrl: 'http://s' });
    expect(req.siteUrl).toBe('http://s');
    expect(req.taskTitle).toBe('x');
    expect(req.dependsOn).toBe('[]');
    const parsed = JSON.parse(String(req.research)) as { competitors: unknown[] };
    expect(parsed.competitors).toHaveLength(1);

    const none = buildRoleInput({ task: task('herald'), idea: 'i', inputs: [], founderNotes: [], siteUrl: 'http://s' });
    expect(none.research).toBe('null'); // no fabricated research, ever
    expect(JSON.parse(String(none.founderNotes))).toEqual([]);
  });

  it('caps founderNotes at 8 entries in both the textarea JSON and the payload', () => {
    const req = buildRoleInput({ task: task('scout'), idea: 'i', inputs: [], founderNotes: Array.from({ length: 12 }, (_, i) => `n${i}`), siteUrl: 's' });
    expect(JSON.parse(String(req.founderNotes))).toHaveLength(8);
  });
});

describe('researchArtifactOf / helpers', () => {
  it('finds exactly one research artifact and rejects empty ones', () => {
    expect(researchArtifactOf([research])?.competitors).toHaveLength(1);

    const siteOnly: Artifact = { ...research, kind: 'site', payload: { headline: 'h', html: '<p>x</p>' } as Artifact['payload'] };
    expect(researchArtifactOf([siteOnly])).toBeNull();
  });

  it('deptOf mirrors task.owner and roleKinds covers CREAO deliverables', () => {
    expect(deptOf(task('herald'))).toBe('herald');
    expect([...roleKinds]).toEqual(['research', 'site', 'launch_kit']);
  });
});
