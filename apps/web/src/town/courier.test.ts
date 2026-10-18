import { describe, expect, it, vi } from 'vitest';
import type { AgentId } from '@hc/contracts';
import type { SimJob } from './sim';
vi.mock('phaser', () => ({ default: { Scene: class {} } }));
import { TownScene } from './TownScene';

describe('courier cue FIFO', () => {
  it('queues an indoor sender exit before the carrying walk, without a rooftop shortcut', () => {
    const jobs: SimJob[] = [];
    const sim = { inside: true, enqueue: (job: SimJob) => jobs.push(job) };
    const scene = Object.create(TownScene.prototype) as TownScene;
    Object.assign(scene, { sims: new Map<AgentId, unknown>([['scout', sim]]) });
    scene.handleCue({ kind: 'exit', agent: 'scout', building: 'library' });
    scene.handleCue({ kind: 'walk', agent: 'scout', to: 'workshop', carrying: { artifactId: 'a_research', kind: 'research' } });
    for (let i = 0; i < 9; i++) scene.handleCue({ kind: 'walk', agent: 'scout', to: 'library' });
    expect(jobs[0]).toEqual({ k: 'exit', building: 'library' });
    expect(jobs[1]).toEqual({ k: 'walk', to: 'workshop', carrying: { artifactId: 'a_research', kind: 'research' } });
    expect(jobs).toHaveLength(11);
    // Cue arrival cannot move the sender or replace an active carrying job.
    expect(sim.inside).toBe(true);
  });
});
