import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: { Scene: class {} } }));
import { TownScene } from './TownScene';

// Advance only live tween callbacks, just as Phaser does after stop/killAll.
function harness() {
  type Effect = { active: boolean; finish(): void; stop(): void };
  const effects: Effect[] = [];
  const pendingTimers: (() => void)[] = [];
  const shapes: { alive: boolean }[] = [];
  const night = { alpha: 0, setAlpha(value: number) { this.alpha = value; } };
  const lamps = { ...night };
  const emitter = { alive: true, setDepth() { return this; }, explode() {},
    stop() { if (!this.alive) throw new Error('A stale timer touched destroyed confetti'); },
    destroy() { this.alive = false; } };
  const tweens = {
    add(config: { targets: object; n?: number; l?: number; onUpdate?: () => void; onComplete?: () => void }) {
      const effect: Effect = {
        active: true,
        stop() { this.active = false; },
        finish() {
          if (!this.active) return;
          if (config.n !== undefined) Object.assign(config.targets, { n: config.n, l: config.l });
          config.onUpdate?.(); config.onComplete?.(); this.active = false;
        },
      };
      effects.push(effect); return effect;
    },
    killAll() { effects.forEach((effect) => effect.stop()); },
    killTweensOf: vi.fn(),
  };
  const scene = Object.create(TownScene.prototype) as TownScene;
  Object.assign(scene, {
    progress: 0, reduced: false, nightAlpha: 0, lampAlpha: 0, night, lampGlows: lamps, nightTween: null,
    tweens, time: { removeAllEvents: vi.fn(), delayedCall(_delay: number, callback: () => void) {
      pendingTimers.push(callback); return { remove: vi.fn() };
    } }, cameras: { main: { resetFX: vi.fn() } },
    sims: new Map(), fx: new Map(), carried: new Map(), flights: [], bubbles: [], items: [],
    verdicts: new Map(), received: new Set(), celebrated: new Set(), puffs: new Set(),
    celebrationAgents: [], celebrateTweens: [], zz: new Map(), confetti: null, effectGeneration: 0,
    snapSource: () => ({ events: [], t: 0 }),
    add: { particles: () => emitter, circle() {
      const shape = { alive: true, setDepth() { return this; }, destroy() { this.alive = false; } };
      shapes.push(shape); return shape;
    } },
  });
  return { scene, effects, shapes, night, lamps, emitter,
    finish: () => effects.forEach((effect) => effect.finish()),
    flushTimers: () => pendingTimers.splice(0).forEach((callback) => callback()),
  };
}

describe('replay effect lifecycle', () => {
  it('a newer progress update replaces the old lighting transition', () => {
    const h = harness();
    h.scene.setProgress(0.3);
    h.scene.setProgress(1);
    expect(h.effects.filter((effect) => effect.active)).toHaveLength(1);
    h.finish();
    expect(h.night.alpha).toBeCloseTo(0.35);
    expect(h.lamps.alpha).toBe(0.9);
  });

  it('seeking removes puffs and prevents pending effects from restoring the old frame', () => {
    const h = harness();
    h.scene.setProgress(1);
    h.scene.spawnPuff({ x: 50, y: 50 });
    expect(h.shapes.filter((shape) => shape.alive)).toHaveLength(3);
    h.scene.snap();
    h.finish();
    expect(h.shapes.some((shape) => shape.alive)).toBe(false);
    expect(h.night.alpha).toBe(0);
    expect(h.lamps.alpha).toBe(0);
  });

  it('fences a celebration timer still waiting for the next Phaser frame when replay restarts', () => {
    const h = harness();
    h.scene.handleCue({ kind: 'celebrate', agents: [] });
    h.scene.snap();
    expect(h.emitter.alive).toBe(false);
    expect(() => h.flushTimers()).not.toThrow();
  });
});
