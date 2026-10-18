import Phaser from 'phaser';
import { ROSTER, type AgentId, type ArtifactKind, type BuildingId } from '@hc/contracts';
import { TILE_SIZE, tileBlocked, type TownPoint } from './map';
import { dockFor, walkPath } from './routing';
import { shouldFastForward } from './policies';

// One resident Sim: a container holding shadow, agent-color ground ring, body,
// face, prop, name tag and the dashed ring. Movement is a per-agent FIFO of
// walk/enter/exit/receive jobs; everything else in town interrupts immediately.

export type CarriedEnvelope = { artifactId: string; kind: ArtifactKind };

export type SimJob =
  | { k: 'walk'; to: BuildingId; carrying?: CarriedEnvelope }
  | { k: 'enter'; building: BuildingId }
  | { k: 'exit'; building: BuildingId }
  | { k: 'receive'; building: BuildingId; artifactId: string };

export type SimHooks = {
  onCarryStart(target: Sim, carrying: CarriedEnvelope): void;
  onCarryArrive(target: Sim, building: BuildingId): void;
  onReceive(target: Sim, building: BuildingId, artifactId: string): void;
  onFastForward(target: Sim): void;
};

export type SimZone = { left: number; right: number; top: number; bottom: number };

const WALK_SPEED = 48;      // map px/s per §10.4
const WANDER_SPEED = 16;    // map px/s idle wander
const FRAME_MS = 125;       // 4-frame walk cycle at 8 fps
const WALK_FRAMES = 4;
const CENTER = TILE_SIZE / 2;
// Paper "sim/*" frames: 16x16 sprite, prop offset (relative to the sprite's top-left), ring at the feet.
const SPRITE_TOP = -10;
const PROP_AT: Record<AgentId, { key: string; x: number; y: number } | null> = {
  mayor: { key: 'prop-top-hat', x: 2, y: -3 },
  scout: { key: 'prop-magnifier', x: 12, y: 5 },
  maker: { key: 'prop-hammer', x: 13, y: 4 },
  herald: { key: 'prop-satchel', x: 0, y: 1 },
  founder: null,
};

const tileCenter = (tile: TownPoint) => ({ x: tile.x * TILE_SIZE + CENTER, y: tile.y * TILE_SIZE + CENTER });
const BOB = [0, -1, 0, -1] as const;

export class Sim {
  readonly id: AgentId;
  readonly container: Phaser.GameObjects.Container;
  private hooks: SimHooks;
  private body: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Image;
  private selectRing: Phaser.GameObjects.Graphics;
  private tagBg: Phaser.GameObjects.Graphics;
  private tagText: Phaser.GameObjects.Text;
  private frameClock = 0;
  private frameIndex = 0;
  private shownFrame = 0;

  tile: TownPoint;
  inside = false;
  reduced = false;
  private fadingWalk = false;
  displayStatus = 'idle';
  hover = false;
  job: SimJob | null = null;
  queue: SimJob[] = [];

  private path: TownPoint[] | null = null;
  private pathIndex = 0;
  private arriving: (() => void) | null = null;
  private wanderPhase: 'pause' | 'move' = 'pause';
  private wanderTimer = 1200;
  private wanderTarget: TownPoint | null = null;
  private wanderEnabled = false;
  private zone: SimZone;
  private fadeTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, id: AgentId, spawn: TownPoint, zone: SimZone, hooks: SimHooks) {
    this.id = id;
    this.tile = spawn;
    this.zone = zone;
    this.hooks = hooks;
    const start = tileCenter(spawn);
    const person = ROSTER[id];
    this.container = scene.add.container(start.x, start.y);

    const ring = scene.add.image(0, 5.5, `ring-${id}`);

    this.selectRing = scene.add.graphics().setVisible(false);
    this.selectRing.lineStyle(1, 0x2b2340, 0.85);
    for (let i = 0; i < 10; i++) {
      this.selectRing.beginPath();
      this.selectRing.arc(0, 5.5, 16, (i / 10) * Math.PI * 2, (i / 10) * Math.PI * 2 + Math.PI / 6);
      this.selectRing.strokePath();
    }

    this.sprite = scene.add.image(0, SPRITE_TOP, `sprite-${id}`).setOrigin(0.5, 0);
    this.body = scene.add.container(0, 0, [this.sprite]);
    const prop = PROP_AT[id];
    if (prop) this.body.add(scene.add.image(-8 + prop.x, SPRITE_TOP + prop.y, prop.key).setOrigin(0, 0));

    this.tagBg = scene.add.graphics();
    this.tagText = scene.add.text(0, 12, person.name.replace('Mayor ', ''), {
      fontFamily: 'Pixelify Sans, monospace', fontSize: '6px', color: '#fff4df',
    }).setOrigin(0.5, 0).setResolution(4);

    [ring, this.selectRing, this.body, this.tagBg, this.tagText]
      .forEach((child) => this.container.add(child));

    this.container.setDepth(start.y + 6);
    this.drawTag();
  }

  private drawTag(): void {
    if (!this.tagText.scene) return;
    const first = ROSTER[this.id].name.replace('Mayor ', '');
    const label = this.hover ? `${first} · ${this.statusLabel()}` : first;
    this.tagText.setText(label);
    const width = this.tagText.width;
    this.tagBg.clear();
    this.tagBg.fillStyle(0x211e2b, 0.9).fillRoundedRect(-(width / 2 + 4), 11, width + 8, 10, 2);
    if (this.hover) {
      const color = Phaser.Display.Color.HexStringToColor(ROSTER[this.id].color).color;
      this.tagBg.lineStyle(1, color, 0.9).strokeRoundedRect(-(width / 2 + 4), 11, width + 8, 10, 2);
    }
  }

  statusLabel(): string {
    if (this.inside) return 'inside';
    if (this.job?.k === 'walk') return 'walking';
    return this.displayStatus;
  }

  /** Recompute the name tag (hover status text, font relayout). */
  refreshTag(): void {
    this.drawTag();
  }

  setHover(on: boolean): void {
    if (this.hover === on) return;
    this.hover = on;
    this.drawTag();
  }

  setSelected(on: boolean): void {
    this.selectRing.setVisible(on);
  }

  private refreshDepth(): void {
    this.container.setDepth(Math.round(this.container.y) + 6);
  }

  positionAt(tile: TownPoint): void {
    this.tile = tile;
    const { x, y } = tileCenter(tile);
    this.container.setPosition(x, y);
    this.refreshDepth();
  }

  reveal(): void {
    this.fadeTween?.stop();
    this.fadeTween = null;
    this.container.setAlpha(1).setVisible(true);
  }

  conceal(): void {
    this.fadeTween?.stop();
    this.fadeTween = null;
    this.container.setAlpha(0).setVisible(false);
  }

  /** Reduced-motion fade-teleport: fade out, move, fade back — 150 ms total. */
  teleportFade(tile: TownPoint, after?: () => void): void {
    this.fadeTween?.stop();
    if (!this.container.visible) { this.positionAt(tile); after?.(); return; }
    const scene = this.container.scene;
    this.fadeTween = scene.tweens.addCounter({
      from: this.container.alpha, to: 0, duration: 75,
      onUpdate: (t) => this.container.setAlpha(t.getValue() ?? 0),
      onComplete: () => {
        this.positionAt(tile);
        this.container.setAlpha(0);
        this.fadeTween?.stop();
        this.fadeTween = scene.tweens.addCounter({
          from: 0, to: 1, duration: 75,
          onUpdate: (t) => this.container.setAlpha(t.getValue() ?? 0),
          onComplete: () => { this.container.setAlpha(1); this.fadeTween = null; after?.(); },
        });
      },
    });
  }

  instantTeleport(tile: TownPoint): void {
    this.fadeTween?.stop();
    this.fadeTween = null;
    this.positionAt(tile);
    this.container.setAlpha(this.inside ? 0 : 1).setVisible(!this.inside);
  }

  setWander(on: boolean): void {
    if (on === this.wanderEnabled) return;
    this.wanderEnabled = on;
    if (!on) { this.wanderPhase = 'pause'; this.wanderTarget = null; this.showFrame(0); }
  }

  enqueue(job: SimJob): void {
    this.queue.push(job);
  }

  /** Walk jobs queued (plus any active) — drives the fast-forward counting. */
  walksQueued(): number {
    return this.queue.filter((entry) => entry.k === 'walk').length + (this.job?.k === 'walk' ? 1 : 0);
  }

  /** Drop every queued and running job; keep the current position. */
  clearJobs(): void {
    this.queue = [];
    this.job = null;
    this.path = null;
    this.arriving = null;
    this.frameClock = 0;
    this.fadingWalk = false;
    this.showFrame(0);
    if (this.fadeTween) { this.fadeTween.stop(); this.fadeTween = null; }
  }

  /** Fast-forwarded plain walk: straight teleport plus a scene puff. */
  fastForward(to: BuildingId): void {
    this.job = null;
    this.path = null;
    this.positionAt(dockFor(to, this.id));
    this.hooks.onFastForward(this);
  }

  private at(tile: TownPoint): boolean {
    return this.tile.x === tile.x && this.tile.y === tile.y;
  }

  private beginWalk(job: { k: 'walk'; to: BuildingId; carrying?: CarriedEnvelope }): void {
    const dock = dockFor(job.to, this.id);
    this.inside = false;
    this.reveal();
    if (this.reduced) {
      this.job = job;
      this.fadingWalk = true;
      if (job.carrying) this.hooks.onCarryStart(this, job.carrying);
      this.teleportFade(dock, () => {
        this.fadingWalk = false;
        this.job = null;
        if (job.carrying) this.hooks.onCarryArrive(this, job.to);
      });
      return;
    }
    // Apply congestion relief only at the FIFO front. A newly received plain
    // walk must never cancel an envelope delivery already in progress.
    if (shouldFastForward(this.walksQueued() + 1, Boolean(job.carrying))) {
      this.fastForward(job.to);
      return;
    }
    if (this.at(dock)) {
      if (job.carrying) this.hooks.onCarryArrive(this, job.to);
      this.job = null;
      return;
    }
    const path = walkPath(this.tile, dock);
    if (!path || path.length < 2) {
      // Hand-placed graph covers every passable lane; a null path can only be
      // a wander drift without a clear lane, so step straight as quick-fade.
      this.fastFadeRun(dock, () => {
        if (job.carrying) this.hooks.onCarryArrive(this, job.to);
      });
      return;
    }
    if (job.carrying) {
      this.hooks.onCarryStart(this, job.carrying);
    }
    this.job = job;
    this.path = path;
    this.pathIndex = 1;
    this.arriving = null;
    this.wanderTarget = null;
  }

  /** Quick-fade fallback used only when BFS reports an unusual position. */
  private fastFadeRun(dock: TownPoint, after: () => void): void {
    this.job = null;
    this.path = null;
    this.hooks.onFastForward(this);
    this.teleportFade(dock);
    this.tile = dock;
    after();
  }

  private beginEnter(job: { k: 'enter'; building: BuildingId }): void {
    const dock = dockFor(job.building, this.id);
    this.job = job;
    if (this.at(dock)) {
      this.conceal();
      this.inside = true;
      this.path = null;
      this.job = null;
      return;
    }
    const path = walkPath(this.tile, dock);
    this.path = path && path.length > 1 ? path : [this.tile];
    this.pathIndex = 1;
    this.arriving = () => {
      this.conceal();
      this.inside = true;
      this.path = null;
      this.job = null;
    };
  }

  private beginExit(job: { k: 'exit'; building: BuildingId }): void {
    this.positionAt(dockFor(job.building, this.id));
    this.inside = false;
    this.path = null;
    this.job = null;
    this.reveal();
  }

  private beginReceive(job: { k: 'receive'; building: BuildingId; artifactId: string }): void {
    this.hooks.onReceive(this, job.building, job.artifactId);
    this.job = null;
  }

  private nextJob(): void {
    while (!this.job && this.queue.length > 0) {
      const job = this.queue.shift()!;
      switch (job.k) {
        case 'walk': this.beginWalk(job); break;
        case 'enter': this.beginEnter(job); break;
        case 'exit': this.beginExit(job); break;
        case 'receive': this.beginReceive(job); break;
      }
    }
  }

  private advancePath(dtMs: number, speed: number): void {
    if (!this.path) { this.job = null; return; }
    const target = this.path[this.pathIndex];
    if (this.pathIndex >= this.path.length || !target) {
      this.finishPath();
      return;
    }
    const to = tileCenter(target);
    const dx = to.x - this.container.x, dy = to.y - this.container.y;
    const distance = Math.hypot(dx, dy);
    const step = (speed * dtMs) / 1000;
    if (distance <= step) {
      this.positionAt(target);
      this.pathIndex += 1;
      if (this.pathIndex >= this.path.length) this.finishPath();
      return;
    }
    this.container.setPosition(this.container.x + (dx / distance) * step, this.container.y + (dy / distance) * step);
    this.refreshDepth();
    this.tickFrame(dtMs);
  }

  private finishPath(): void {
    this.path = null;
    const callback = this.arriving;
    this.arriving = null;
    const job = this.job;
    if (job?.k === 'walk' && job.carrying) {
      this.hooks.onCarryArrive(this, job.to);
    }
    this.job = null;
    callback?.();
  }

  private tickFrame(dtMs: number): void {
    this.frameClock += dtMs;
    if (this.frameClock >= FRAME_MS) {
      this.frameClock -= FRAME_MS;
      this.frameIndex = (this.frameIndex + 1) % WALK_FRAMES;
      this.showFrame(this.frameIndex);
    }
  }

  private showFrame(index: number): void {
    this.shownFrame = index;
    this.body.setY(BOB[index]);
    this.sprite.setFlipX(index >= 2);
  }

  private pickWanderTarget(): TownPoint | null {
    for (let attempt = 0; attempt < 12; attempt++) {
      const x = this.zone.left + Math.floor(Math.random() * (this.zone.right - this.zone.left + 1));
      const y = this.zone.top + Math.floor(Math.random() * (this.zone.bottom - this.zone.top + 1));
      if (tileBlocked(x, y)) continue;
      const tile: TownPoint = { x, y };
      if (this.at(tile)) continue;
      if (Math.abs(tile.x - this.tile.x) + Math.abs(tile.y - this.tile.y) < 2) continue;
      return tile;
    }
    return null;
  }

  update(dtMs: number, freeze: boolean, scale = 1): void {
    if (freeze || this.fadingWalk) return;
    let job: SimJob | null = this.job;
    if (!job || job.k !== 'walk') {
      this.nextJob();
      if (this.fadingWalk) return;
      job = this.job;
    }
    if (job !== null && job.k === 'walk') {
      this.advancePath(dtMs, WALK_SPEED * scale);
      return;
    }
    if (this.wanderEnabled) this.updateWander(dtMs, scale);
    else if (this.shownFrame !== 0) this.showFrame(0);
  }

  private updateWander(dtMs: number, scale: number): void {
    this.wanderTimer -= dtMs;
    if (this.wanderPhase === 'pause') {
      if (this.wanderTimer > 0) return;
      const target = this.pickWanderTarget();
      if (!target) { this.wanderTimer = 1500; return; }
      this.wanderTarget = target;
      this.wanderPhase = 'move';
      return;
    }
    const target = this.wanderTarget;
    if (!target) { this.wanderPhase = 'pause'; this.wanderTimer = 2000; return; }
    const to = tileCenter(target);
    const dx = to.x - this.container.x, dy = to.y - this.container.y;
    const distance = Math.hypot(dx, dy);
    const step = (WANDER_SPEED * scale * dtMs) / 1000;
    if (distance <= step) {
      this.positionAt(target);
      this.wanderPhase = 'pause';
      this.wanderTarget = null;
      this.wanderTimer = 2000 + Math.random() * 3000; // 2–5 s between moves
      this.showFrame(0);
      return;
    }
    this.container.setPosition(this.container.x + (dx / distance) * step, this.container.y + (dy / distance) * step);
    this.refreshDepth();
    this.tickFrame(dtMs);
  }
}
