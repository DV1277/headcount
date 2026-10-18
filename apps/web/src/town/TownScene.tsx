import Phaser from 'phaser';
import { ROSTER, type AgentId, type ArtifactKind, type BuildingId, type EventEnvelope } from '@hc/contracts';
import type { Cue } from '@hc/engine';
import { bridge } from '../bridge';
import {
  admitBubble, BUBBLE_HOLD_MS, BUBBLE_IN_MS, BUBBLE_OUT_MS, fitCanvasLabel, motionWord, truncateText, visualDuration,
  type BubbleEntry, type BubblePriority,
} from './policies';
import { buildSnapshot, type SimSnapshot } from './snapshot';
import { dockFor } from './routing';
import { Sim, type CarriedEnvelope, type SimZone } from './sim';
import {
  BUILDINGS, DOOR_ANCHORS, HALL_STEP_SLOTS, LAMP_SPOTS, MAP_HEIGHT, MAP_WIDTH, PLAZA,
  ROOF_CENTER, SIM_SPAWN_POINTS, TILE_SIZE, type TownPoint,
} from './map';

const TOWN_ART = '/assets/town';
const WANDER_ZONE: SimZone = PLAZA.zone;
const NIGHT_COLOR = 0x28205f; // --night token
const DEPTH_TOP = MAP_HEIGHT + 120;

const tilePx = (tile: TownPoint) => ({ x: tile.x * TILE_SIZE + TILE_SIZE / 2, y: tile.y * TILE_SIZE + TILE_SIZE / 2 });
const hexColor = (hex: string) => Phaser.Display.Color.HexStringToColor(hex).color;
export const buildingOf = (agent: AgentId): Exclude<BuildingId, 'plaza'> =>
  ROSTER[agent].building as Exclude<BuildingId, 'plaza'>;

type BuildingFxView = {
  building: Exclude<BuildingId, 'plaza'>;
  glow: Phaser.GameObjects.Graphics;
  glowTween: Phaser.Tweens.Tween | null;
  alert: Phaser.GameObjects.Graphics;
  alertText: Phaser.GameObjects.Text | Phaser.GameObjects.Image | null;
  alertTween: Phaser.Tweens.Tween | null;
  alertFade: Phaser.Tweens.Tween | null;
  badgeX: number;
  badgeY: number;
  activeGlow?: string;
};

type ItemView = {
  sprite: Phaser.GameObjects.Sprite;
  artifactId: string;
  kind: ArtifactKind;
  slot: number;
  landing: boolean;
  pendingStamp: boolean;
  motion: Phaser.Tweens.Tween[];
  stamp: { verdict: 'accept' | 'revise'; g: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text } | null;
};

type BubbleView = {
  entry: BubbleEntry;
  container: Phaser.GameObjects.Container;
  holdTimer: Phaser.Time.TimerEvent | null;
  width: number;
  height: number;
  retiring: boolean;
};

export type SceneController = {
  handleCue(cue: Cue): void;
  snap(): void;
  setProgress(progress: number): void;
  setSpeed(speed: number): void;
  setReduced(reduced: boolean): void;
  setSelected(agent: AgentId | null): void;
  setAgentStatuses(statuses: Record<AgentId, string>): void;
  setBoardTitle(title: string): void;
  getSimPositions(): Record<AgentId, { x: number; y: number }>;
};

export type SceneRef = { current: SceneController | null };
export type SnapSource = () => { events: readonly EventEnvelope[]; t: number };
export type SyncSource = () => {
  progress: number; speed: number; reduced: boolean;
  selected: AgentId | null; statuses: Record<AgentId, string>; title?: string;
};

export class TownScene extends Phaser.Scene {
  private ref: SceneRef;
  private snapSource: SnapSource;
  private syncSource: SyncSource;
  private sims = new Map<AgentId, Sim>();
  private fx = new Map<Exclude<BuildingId, 'plaza'>, BuildingFxView>();
  private bubbles: BubbleView[] = [];
  private bubbleClock = 0;
  private items: ItemView[] = [];
  private carried = new Map<AgentId, { sprite: Phaser.GameObjects.Sprite; bob: Phaser.Tweens.Tween | null; artifactId: string } | null>();
  private flights: { sprite: Phaser.GameObjects.Sprite; tween: Phaser.Tweens.Tween }[] = [];
  private confetti: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private celebrateTweens: Phaser.Tweens.Tween[] = [];
  private celebrating = false;
  private zz = new Map<AgentId, Phaser.GameObjects.Text>();
  private boardText: Phaser.GameObjects.Text | null = null;
  private boardTitle = '';
  private nightTween: Phaser.Tweens.Tween | null = null;
  private received = new Set<string>();
  private celebrated = new Set<AgentId>();
  private celebrationAgents: readonly AgentId[] = [];
  private puffs = new Set<Phaser.GameObjects.Arc>();
  private effectGeneration = 0;
  private night: Phaser.GameObjects.Graphics | null = null;
  private lampGlows: Phaser.GameObjects.Graphics | null = null;
  private nightAlpha = 0;
  private lampAlpha = 0;
  private speed = 1;
  private reduced = false;
  private frozen = false;
  private selected: AgentId | null = null;
  private progress = 0;

  constructor(ref: SceneRef, snapSource: SnapSource, syncSource: SyncSource) {
    super('town');
    this.ref = ref;
    this.snapSource = snapSource;
    this.syncSource = syncSource;
  }

  preload() {
    // Town art assembled from the Paper file's "02 Town" frames (scripts/build-town-assets.py).
    this.load.image('ground', `${TOWN_ART}/ground.png`);
    for (const building of BUILDINGS) this.load.image(`building-${building.id}`, `${TOWN_ART}/building-${building.id}.png`);
    this.load.image('sign', `${TOWN_ART}/sign.png`);
    for (const agent of Object.keys(ROSTER) as AgentId[]) {
      this.load.image(`sprite-${agent}`, `${TOWN_ART}/sprite-${agent}.png`);
      this.load.image(`ring-${agent}`, `${TOWN_ART}/ring-${agent}.png`);
    }
    for (const kind of ['research', 'site', 'launch_kit', 'brief']) this.load.image(`hc-item-${kind}`, `${TOWN_ART}/item-${kind}.png`);
    this.load.image('hc-envelope', `${TOWN_ART}/item-envelope.png`);
    this.load.image('stamp-alert', `${TOWN_ART}/stamp-alert.png`);
    for (const prop of ['top-hat', 'magnifier', 'hammer', 'satchel']) this.load.image(`prop-${prop}`, `${TOWN_ART}/prop-${prop}.png`);
  }

  create() {
    this.cameras.main.setBackgroundColor('#7bbd79');
    this.cameras.main.setZoom(2).centerOn(MAP_WIDTH / 2, MAP_HEIGHT / 2);
    this.drawGround();
    this.drawBuildings();
    this.drawNoticeBoard();
    this.drawNight();
    this.makeTextures();
    this.drawResidents();

    this.register();
    this.applySync(true);
    this.snap();

    document.fonts?.ready.then(() => {
      if (!this.sys.isActive()) return;
      this.time.delayedCall(0, () => this.refreshTexts());
    }).catch(() => undefined);
  }

  private register() {
    const controller: SceneController = {
      handleCue: (cue) => this.handleCue(cue),
      snap: () => this.snap(),
      setProgress: (p) => this.setProgress(p),
      setSpeed: (s) => this.setSpeed(s),
      setReduced: (r) => this.setReduced(r),
      setSelected: (a) => this.setSelected(a),
      setAgentStatuses: (s) => this.setAgentStatuses(s),
      setBoardTitle: (t) => this.setBoardTitle(t),
      getSimPositions: () => this.getSimPositions(),
    };
    this.ref.current = controller;
    const cleanup = () => {
      if (this.ref.current === controller) this.ref.current = null;
    };
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
  }

  // --- world ----------------------------------------------------------------

  private drawGround() {
    // Ground, decor, steps, fountain, lamps and the notice-board frame are baked into one image.
    this.add.image(0, 0, 'ground').setOrigin(0).setDepth(0);
  }

  private drawBuildings() {
    for (const building of BUILDINGS) {
      const { x, y, width, height } = building.bounds;
      const bx = x * TILE_SIZE;
      const by = y * TILE_SIZE;
      const bw = width * TILE_SIZE;
      const bh = height * TILE_SIZE;
      this.add.image(bx, by, `building-${building.id}`).setOrigin(0).setDepth((y + height) * TILE_SIZE - 1);
      if (building.id === 'hall') this.add.image(MAP_WIDTH / 2 - 67, 12, 'sign').setOrigin(0).setDepth((y + height) * TILE_SIZE);

      const windowY = by + 37;
      // Window-glow layer: two lit windows plus a rooftop halo in agent color.
      const glow = this.add.graphics().setDepth((y + height) * TILE_SIZE + 2).setAlpha(0);
      // Lit windows plus a soft halo in the owner's identity color (Paper "Town — Evening").
      const identity = hexColor(ROSTER[building.owner].color);
      for (let i = 4; i >= 1; i--) glow.fillStyle(identity, 0.07).fillRoundedRect(bx - i * 3, by - i * 3, bw + i * 6, bh + i * 6, 6 + i * 2);
      glow.fillStyle(0xffe59a, 0.95).fillRect(bx + 17, windowY, 16, 17).fillRect(bx + bw - 33, windowY, 16, 17);

      this.fx.set(building.id as Exclude<BuildingId, 'plaza'>, {
        building: building.id as Exclude<BuildingId, 'plaza'>,
        glow, glowTween: null,
        alert: this.add.graphics().setDepth((y + height) * TILE_SIZE + 30).setAlpha(0),
        alertText: null, alertTween: null, alertFade: null,
        badgeX: bx + bw / 2, badgeY: by - 6,
      });
    }
  }

  private drawNoticeBoard() {
    // Frame is part of the ground image (Paper: 360,124, 44x36); the board shows the run title (§10.1 craft touch 3).
    this.boardText = this.add.text(382, 128, 'OPEN FOR\nBUSINESS', {
      fontFamily: 'Pixelify Sans, monospace', fontSize: '6px', color: '#342e3d', align: 'center', lineSpacing: -1,
    }).setOrigin(0.5, 0).setDepth(PLAZA.board.y * TILE_SIZE + 21);
    this.boardText.setResolution(4);
  }

  setBoardTitle(title: string): void {
    this.boardTitle = title;
    if (!this.boardText) return;
    const label = fitCanvasLabel(title.trim() || 'OPEN FOR BUSINESS', 34, 2, (candidate) => {
      this.boardText!.setText(candidate);
      return this.boardText!.width;
    });
    this.boardText.setText(label);
  }

  private drawNight() {
    this.night = this.add.graphics().setDepth(DEPTH_TOP);
    this.night.fillStyle(NIGHT_COLOR, 1).fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.night.setBlendMode(Phaser.BlendModes.MULTIPLY).setAlpha(0);
    this.lampGlows = this.add.graphics().setDepth(DEPTH_TOP + 1);
    this.lampGlows.setBlendMode(Phaser.BlendModes.ADD);
    for (const spot of LAMP_SPOTS) {
      const center = tilePx(spot);
      this.lampGlows.fillStyle(0xffd57c, 0.3).fillCircle(center.x, center.y + 2, 14);
      this.lampGlows.fillStyle(0xfff2cc, 0.25).fillCircle(center.x, center.y + 2, 7);
    }
    this.lampGlows.setAlpha(0);
  }

  // --- generated textures -----------------------------------------------------

  private makeTextures() {
    const dot = this.add.graphics();
    dot.fillStyle(0xffffff, 1).fillRect(0, 0, 3, 3);
    dot.generateTexture('hc-dot', 3, 3);
    dot.destroy();
  }

  // --- residents --------------------------------------------------------------

  private drawResidents() {
    const hooks = {
      onCarryStart: (target: Sim, carrying: CarriedEnvelope) => this.attachEnvelope(target.id, carrying),
      onCarryArrive: (target: Sim, building: BuildingId) => this.absorbEnvelope(target.id, building),
      onReceive: (target: Sim, building: BuildingId, artifactId: string) => {
        void target;
        this.markReceived(building, artifactId);
      },
      onFastForward: (target: Sim) => this.spawnPuff(tilePx(target.tile)),
    };
    for (const [id, spawn] of Object.entries(SIM_SPAWN_POINTS) as [AgentId, TownPoint][]) {
      const sim = new Sim(this, id, spawn, WANDER_ZONE, hooks);
      sim.container.setInteractive({
        hitArea: new Phaser.Geom.Rectangle(-16, -22, 32, 40),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: true,
      });
      sim.container.on('pointerover', () => sim.setHover(true));
      sim.container.on('pointerout', () => sim.setHover(false));
      sim.container.on('pointerdown', () => bridge.emit('select', { agent: id }));
      this.sims.set(id, sim);
      this.carried.set(id, null);
    }
  }

  private refreshTexts() {
    this.setBoardTitle(this.boardTitle);
    for (const sim of this.sims.values()) sim.refreshTag();
    for (const item of this.items) {
      if (item.stamp) item.stamp.text.setResolution(4);
    }
    for (const text of this.zz.values()) text.setResolution(4);
    for (const fx of this.fx.values()) if (fx.alertText instanceof Phaser.GameObjects.Text) fx.alertText.setResolution(4);
  }

  // --- reduced-state sync -------------------------------------------------------

  private applySync(initial: boolean) {
    const sync = this.syncSource();
    if (initial) {
      this.speed = sync.speed || 1;
      this.setReduced(sync.reduced);
      this.selected = sync.selected;
    }
    this.progress = sync.progress;
    this.setNightAlpha();
    this.setSelected(sync.selected);
    this.setAgentStatuses(sync.statuses);
    this.setBoardTitle(sync.title ?? this.boardTitle);
  }

  /** Rebuild the town from the append-only log at the current clock (§8.5). */
  snap() {
    const source = this.snapSource();
    const snapshot = buildSnapshot(source.events, source.t);
    this.applySnapshot(snapshot);
  }

  private applySnapshot(snapshot: SimSnapshot) {
    this.clearTransientFX();

    for (const [id, sim] of this.sims) {
      const state = snapshot.agents[id];
      sim.clearJobs();
      sim.inside = state.inside;
      sim.instantTeleport(state.tile);
      sim.displayStatus = motionWord(snapshot.agentStatus[id]);
      sim.setSelected(this.selected === id);
    }
    for (const fx of this.fx.values()) {
      const building = snapshot.buildings[fx.building];
      this.applyGlow(fx, Boolean(building.glow), building.glow, true);
      this.applyAlert(fx, Boolean(building.alert), building.alert ?? 'question', true);
    }
    this.rebuildItems(snapshot.items);
    this.frozen = snapshot.frozen;
    this.setZzVisibility();
    this.progress = snapshot.progress;
    this.setNightAlpha();
    if (snapshot.celebrating) this.celebrate(['mayor', 'scout', 'maker', 'herald', 'founder']);
  }

  private clearTransientFX() {
    // Seeking replaces the whole visual state. Counter tweens and delayed
    // callbacks must not write into sprites recreated for the new clock.
    this.effectGeneration += 1;
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.cameras.main.resetFX();
    this.nightTween = null;
    this.verdicts.clear();
    this.received.clear();
    this.celebrated.clear();
    this.celebrationAgents = [];
    for (const puff of this.puffs) puff.destroy();
    this.puffs.clear();
    for (const [, carried] of this.carried) {
      carried?.bob?.stop();
      if (carried) this.tweens.killTweensOf(carried.sprite);
      carried?.sprite.destroy();
    }
    this.carried.clear();
    for (const flight of this.flights) flight.tween.stop();
    for (const flight of this.flights) flight.sprite.destroy();
    this.flights = [];
    for (const bubble of this.bubbles) {
      bubble.holdTimer?.remove(false);
      bubble.container.destroy();
    }
    this.bubbles = [];
    this.confetti?.destroy();
    this.confetti = null;
    for (const tween of this.celebrateTweens) tween.stop();
    this.celebrateTweens = [];
    this.celebrating = false;
    for (const text of this.zz.values()) text.destroy();
    this.zz.clear();
  }

  private setZzVisibility() {
    for (const [id, sim] of this.sims) {
      const existing = this.zz.get(id);
      if (this.frozen) {
        if (existing || !sim.container.visible) continue;
        const text = this.add.text(0, -26, 'z z', {
          fontFamily: 'Pixelify Sans, monospace', fontSize: '9px', color: '#4b3a56',
        }).setOrigin(0.5, 1);
        text.setResolution(4);
        sim.container.add(text);
        if (!this.reduced) {
          this.tweens.add({ targets: text, y: -29, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        }
        this.zz.set(id, text);
      } else if (existing) {
        existing.destroy();
        this.zz.delete(id);
      }
    }
  }

  private scheduleEffect(delay: number, callback: () => void) {
    const generation = this.effectGeneration;
    // Phaser's removeAllEvents only removes active timers, not timers queued
    // for insertion this frame. Fence those callbacks across seek/restart too.
    return this.time.delayedCall(delay, () => {
      if (generation === this.effectGeneration) callback();
    });
  }

  private rebuildItems(next: SimSnapshot['items']) {
    for (const item of this.items) {
      this.destroyItem(item);
    }
    this.items = [];
    for (const entry of next) {
      const slot = HALL_STEP_SLOTS[entry.slot] ?? HALL_STEP_SLOTS[0];
      const point = tilePx(slot);
      const key = `hc-item-${entry.kind}`;
      const sprite = this.add.sprite(point.x, point.y, this.textures.exists(key) ? key : 'hc-item-research');
      sprite.setDepth(slot.y * TILE_SIZE + 4);
      sprite.setInteractive({ useHandCursor: true });
      sprite.on('pointerdown', () => bridge.emit('openArtifact', { artifactId: entry.artifactId }));
      const view: ItemView = { sprite, artifactId: entry.artifactId, kind: entry.kind, slot: entry.slot, landing: false, pendingStamp: false, stamp: null, motion: [] };
      this.items.push(view);
      if (entry.verdict) this.drawStamp(view, entry.verdict, true);
    }
  }

  // --- cue player -------------------------------------------------------------

  handleCue(cue: Cue) {
    switch (cue.kind) {
      case 'walk': return this.queueWalk(cue.agent, cue.to, cue.carrying);
      case 'enter': return this.sims.get(cue.agent)?.enqueue({ k: 'enter', building: cue.building });
      case 'exit': return this.sims.get(cue.agent)?.enqueue({ k: 'exit', building: cue.building });
      case 'receive': return this.sims.get(cue.agent)?.enqueue({ k: 'receive', building: buildingOf(cue.agent), artifactId: cue.artifactId });
      case 'bubble': return this.showBubble(cue.agent, cue.text, cue.priority);
      case 'glow': {
        const view = this.fx.get(cue.building as Exclude<BuildingId, 'plaza'>);
        if (view) this.applyGlow(view, cue.on, cue.color, false);
        return;
      }
      case 'alert': {
        const view = this.fx.get(cue.building as Exclude<BuildingId, 'plaza'>);
        if (view) this.applyAlert(view, cue.on, cue.tone, false);
        return;
      }
      case 'pop': return this.popItem(cue.building, cue.artifactId, cue.artifactKind);
      case 'stamp': return this.stampItem(cue.artifactId, cue.verdict);
      case 'freeze': return this.setFrozen(cue.on);
      case 'celebrate': return this.celebrate(cue.agents);
    }
  }

  private queueWalk(agent: AgentId, target: BuildingId, carrying?: CarriedEnvelope) {
    const sim = this.sims.get(agent);
    if (!sim) return;
    // Exit and delivery must execute in order; the preceding exit cue may
    // still be queued when this cue arrives.
    sim.enqueue({ k: 'walk', to: target, carrying });
  }

  private setFrozen(on: boolean) {
    if (this.frozen === on) return;
    this.frozen = on;
    this.setZzVisibility();
  }

  // --- building FX ------------------------------------------------------------

  private applyGlow(fx: BuildingFxView, on: boolean, color: string | undefined, instant: boolean) {
    if (!instant && on && color && fx.activeGlow === color) return;
    fx.activeGlow = on ? color : undefined;
    fx.glowTween?.stop();
    fx.glowTween = null;
    this.tweens.killTweensOf(fx.glow);
    if (!on || !color) {
      if (instant || this.reduced) {
        fx.glow.setAlpha(0);
        return;
      }
      fx.glowTween = this.tweens.add({ targets: fx.glow, alpha: 0, duration: visualDuration(300, this.speed, 180) });
      return;
    }
    if (instant || this.reduced) {
      fx.glow.setAlpha(0.75);
      return;
    }
    fx.glowTween = this.tweens.add({
      targets: fx.glow,
      alpha: { from: fx.glow.alpha, to: 0.75 },
      duration: visualDuration(300, this.speed, 180),
      ease: 'Sine.easeOut',
      onComplete: () => {
        // Keep ambient breathing on wall time; accelerated replay uses a steady light.
        if (this.speed > 4) return;
        fx.glowTween = this.tweens.add({
          targets: fx.glow, alpha: { from: 0.75, to: 0.5 }, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.easeInOut',
        });
      },
    });
  }

  private applyAlert(fx: BuildingFxView, on: boolean, tone: 'question' | 'error', instant: boolean) {
    fx.alertTween?.stop();
    fx.alertTween = null;
    fx.alertFade?.stop();
    fx.alertFade = null;
    if (fx.alertText) this.tweens.killTweensOf(fx.alertText);
    fx.alertText?.destroy();
    fx.alertText = null;
    this.tweens.killTweensOf(fx.alert);
    if (!on) {
      const fade = this.tweens.addCounter({
        from: fx.alert.alpha, to: 0, duration: instant || this.reduced ? 60 : 220,
        onUpdate: (t) => fx.alert.setAlpha(t.getValue() ?? 0),
      });
      if (instant) fade.complete();
      fx.alertFade = fade;
      return;
    }
    fx.alert.clear();
    if (tone === 'error') {
      // Paper "Red ! stamp" badge over the roof.
      fx.alertText = this.add.image(fx.badgeX, fx.badgeY, 'stamp-alert').setDepth(DEPTH_TOP - 5);
    } else {
      // Founder needed: the amber "!" tile over City Hall.
      fx.alert.fillStyle(0xf2b544, 1).fillRect(fx.badgeX - 9, fx.badgeY - 9, 18, 18);
      fx.alert.lineStyle(1.5, 0x1d1a2b, 1).strokeRect(fx.badgeX - 9, fx.badgeY - 9, 18, 18);
      fx.alertText = this.add.text(fx.badgeX, fx.badgeY + 0.5, '!', {
        fontFamily: 'Pixelify Sans, monospace', fontSize: '12px', color: '#1d1a2b', fontStyle: 'bold',
      }).setOrigin(0.5, 0.5).setDepth(DEPTH_TOP - 5);
      fx.alertText.setResolution(4);
    }
    if (tone === 'error') this.spawnPuff({ x: fx.badgeX, y: fx.badgeY - 10 });
    if (instant || this.reduced || this.speed > 4) {
      fx.alert.setAlpha(1);
      fx.alertText.setScale(1);
      return;
    }
    fx.alert.setAlpha(0);
    fx.alertFade = this.tweens.add({ targets: fx.alert, alpha: 1, duration: 220 });
    fx.alertTween = this.tweens.add({
      targets: fx.alertText, scale: { from: 0.95, to: 1.05 }, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  // --- bubbles (HC-F-082) -------------------------------------------------------

  private showBubble(agent: AgentId, rawText: string, priority: BubblePriority) {
    const sim = this.sims.get(agent);
    const text = truncateText(rawText);
    if (!sim || !text) return;
    const admission = admitBubble(this.bubbles.map((view) => view.entry), {
      id: ++this.bubbleClock, agent, text, priority,
    });
    for (const evicted of admission.evicted) {
      const victim = this.bubbles.find((view) => view.entry.id === evicted.id);
      if (victim) this.retireBubble(victim, 0);
    }
    const adoption = admission.admitted;
    if (!adoption) return;

    const textObj = this.add.text(0, 0, text, {
      fontFamily: 'Pixelify Sans, monospace', fontSize: '8px', color: '#1d1a2b',
      wordWrap: { width: 116, useAdvancedWrap: true },
    }).setDepth(DEPTH_TOP - 10);
    textObj.setResolution(4);
    const bg = this.add.graphics();
    const pw = textObj.width;
    const ph = textObj.height;
    // Paper bubble: parchment fill, 1px ink border, square corners, stepped tail at the bottom-left.
    bg.fillStyle(0xf6efe1, 1).fillRect(-6, -4, pw + 12, ph + 8);
    bg.lineStyle(1, 0x1d1a2b, 1).strokeRect(-5.5, -3.5, pw + 11, ph + 7);
    bg.fillStyle(0xf6efe1, 1).fillRect(2, ph + 3, 5, 2).fillRect(2, ph + 5, 3, 2).fillRect(2, ph + 7, 1, 1);
    bg.fillStyle(0x1d1a2b, 1).fillRect(1, ph + 4, 1, 4).fillRect(2, ph + 8, 1, 1).fillRect(3, ph + 6, 1, 2).fillRect(5, ph + 5, 1, 1).fillRect(7, ph + 3, 1, 2);
    const container = this.add.container(0, 0, [bg, textObj]).setDepth(DEPTH_TOP - 10);

    const view: BubbleView = { entry: adoption, container, holdTimer: null, width: pw, height: ph, retiring: false };
    this.bubbles.push(view);
    this.positionBubble(view);
    if (this.reduced) container.setAlpha(1);
    else {
      container.setAlpha(0);
      this.tweens.add({
        targets: container,
        alpha: { from: 0, to: 1 },
        scaleX: { from: 0.8, to: 1 },
        scaleY: { from: 0.8, to: 1 },
        duration: visualDuration(BUBBLE_IN_MS, this.speed),
      });
    }
    view.holdTimer = this.scheduleEffect(visualDuration(BUBBLE_HOLD_MS, this.speed, 1800), () => {
      view.holdTimer = null;
      this.retireBubble(view, visualDuration(BUBBLE_OUT_MS, this.speed, 160));
    });
  }

  private retireBubble(view: BubbleView, fadeMs: number) {
    if (!this.bubbles.includes(view)) return;
    if (view.retiring && fadeMs > 0) return;
    view.retiring = true;
    this.tweens.killTweensOf(view.container);
    if (view.holdTimer) { view.holdTimer.remove(false); view.holdTimer = null; }
    const kill = () => {
      view.container.destroy();
      this.bubbles = this.bubbles.filter((b) => b !== view);
    };
    if (fadeMs <= 0) kill();
    else this.tweens.add({ targets: view.container, alpha: 0, duration: fadeMs, onComplete: kill });
  }

  private positionBubble(view: BubbleView) {
    const sim = this.sims.get(view.entry.agent);
    if (!sim) return;
    const x = Phaser.Math.Clamp(sim.container.x - view.width / 2, 8, MAP_WIDTH - view.width - 8);
    let y = Math.max(8, sim.container.y - view.height - 32);
    for (const other of this.bubbles) {
      if (other === view || other.entry.id > view.entry.id) continue;
      const at = other.container;
      if (x < at.x + other.width + 12 && x + view.width + 12 > at.x && y < at.y + other.height + 12 && y + view.height + 12 > at.y) {
        y = Math.max(8, at.y - view.height - 16);
      }
    }
    view.container.setPosition(x, y);
  }

  private destroyItem(item: ItemView) {
    for (const tween of item.motion) tween.stop();
    this.tweens.killTweensOf(item.sprite);
    item.sprite.destroy();
    if (item.stamp) {
      this.tweens.killTweensOf([item.stamp.g, item.stamp.text]);
      item.stamp.g.destroy(); item.stamp.text.destroy();
    }
  }

  // --- deliverables: pops, stamps (HC-F-083 / -085) -----------------------------

  private popItem(building: BuildingId, artifactId: string, kind: ArtifactKind) {
    if (building === 'plaza') return;
    const from = tilePx(ROOF_CENTER[building as Exclude<BuildingId, 'plaza'>]);
    const source = this.snapSource();
    const current = buildSnapshot(source.events, source.t).items;
    const currentIds = new Set(current.map((item) => item.artifactId));
    for (const old of [...this.items]) {
      if (currentIds.has(old.artifactId) && old.artifactId !== artifactId) continue;
      this.destroyItem(old);
      this.items.splice(this.items.indexOf(old), 1);
    }
    // Reconcile the surviving items with the same layout used after scrubbing.
    for (const item of this.items) {
      const entry = current.find((next) => next.artifactId === item.artifactId);
      if (!entry || item.landing || item.slot === entry.slot) continue;
      item.slot = entry.slot;
      const point = tilePx(HALL_STEP_SLOTS[item.slot]);
      item.sprite.setPosition(point.x, point.y);
      if (item.stamp) {
        item.stamp.g.setPosition(point.x, point.y);
        item.stamp.text.setPosition(point.x + (item.stamp.verdict === 'accept' ? 3 : 0), point.y);
      }
    }
    const slotIndex = current.find((item) => item.artifactId === artifactId)?.slot ?? 0;
    const slotTile = HALL_STEP_SLOTS[slotIndex];
    const slot = tilePx(slotTile);
    const key = `hc-item-${kind}`;
    const sprite = this.add.sprite(from.x, from.y, this.textures.exists(key) ? key : 'hc-item-research');
    sprite.setDepth(DEPTH_TOP - 30);
    sprite.setInteractive({ useHandCursor: true });
    sprite.on('pointerdown', () => bridge.emit('openArtifact', { artifactId }));
    const view: ItemView = { sprite, artifactId, kind, slot: slotIndex, landing: true, pendingStamp: false, stamp: null, motion: [] };
    this.items.push(view);
    if (this.reduced) {
      sprite.setPosition(slot.x, slot.y);
      sprite.setDepth(slotTile.y * TILE_SIZE + 4);
      view.landing = false;
      return;
    }
    const counter = { k: 0 };
    view.motion.push(this.tweens.add({
      targets: counter,
      k: 1,
      duration: visualDuration(600, this.speed, 260),
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        const k = counter.k;
        sprite.setPosition(
          from.x + (slot.x - from.x) * k,
          from.y + (slot.y - from.y) * k - 46 * Math.sin(Math.PI * k),
        );
      },
      onComplete: () => {
        sprite.setPosition(slot.x, slot.y);
        const bounce = { h: 0 };
        view.motion.push(this.tweens.add({
          targets: bounce,
          h: 1,
          duration: visualDuration(150, this.speed, 100),
          yoyo: true,
          ease: 'Sine.easeOut',
          onUpdate: () => sprite.setY(slot.y - 5 * Math.sin(Math.PI * bounce.h)),
          onComplete: () => {
            sprite.setPosition(slot.x, slot.y);
            sprite.setDepth(slotTile.y * TILE_SIZE + 4);
            view.landing = false;
            if (view.pendingStamp) {
              view.pendingStamp = false;
              this.stampItem(artifactId, this.pendingVerdict(artifactId) ?? 'accept');
            }
          },
        }));
      },
    }));
  }

  private verdicts = new Map<string, 'accept' | 'revise'>();
  private pendingVerdict(artifactId: string): 'accept' | 'revise' | undefined {
    return this.verdicts.get(artifactId);
  }

  private stampItem(artifactId: string, verdict: 'accept' | 'revise') {
    this.verdicts.set(artifactId, verdict);
    const view = this.items.find((item) => item.artifactId === artifactId);
    if (!view) return;
    if (view.landing) {
      view.pendingStamp = true;
      return;
    }
    this.drawStamp(view, verdict, false);
  }

  private drawStamp(view: ItemView, verdict: 'accept' | 'revise', instant: boolean) {
    if (view.stamp?.verdict === verdict) return;
    if (view.stamp) {
      this.tweens.killTweensOf([view.stamp.g, view.stamp.text]);
      view.stamp.g.destroy(); view.stamp.text.destroy(); view.stamp = null;
    }
    const px = view.sprite.x;
    const py = view.sprite.y;
    const ok = verdict === 'accept';
    const color = ok ? 0x2c7a41 : 0xa12e2e;
    const g = this.add.graphics().setDepth(view.sprite.depth + 2);
    g.fillStyle(0xf6efe1, 0.96).fillRoundedRect(-15, -6, 30, 12, 2);
    g.lineStyle(1.5, color, 1).strokeRoundedRect(-15, -6, 30, 12, 2);
    if (ok) g.lineStyle(1.5, color, 1).beginPath().moveTo(-13, 0).lineTo(-11, 2).lineTo(-8.5, -2.5).strokePath();
    const text = this.add.text(px + (ok ? 3 : 0), py, ok ? 'ACCEPTED' : 'SENT BACK', {
      fontFamily: 'IBM Plex Mono, monospace', fontSize: '4px', fontStyle: 'bold', color: ok ? '#2c7a41' : '#a12e2e',
    }).setOrigin(0.5, 0.5).setDepth(view.sprite.depth + 3);
    text.setResolution(4);
    g.setPosition(px, py);
    g.setRotation(-0.07);
    text.setRotation(-0.07);
    view.stamp = { verdict, g, text };
    if (instant || this.reduced || this.speed > 4) return;
    g.setScale(1.6);
    text.setScale(1.6);
    this.tweens.add({
      targets: [g, text],
      scaleX: 1,
      scaleY: 1,
      duration: visualDuration(220, this.speed, 180),
      ease: 'Back.easeOut',
    });
  }

  // --- envelopes: carry, airmail, receive ----------------------------------------

  private attachEnvelope(agent: AgentId, carrying: CarriedEnvelope) {
    const sim = this.sims.get(agent);
    if (!sim) return;
    this.releaseCarried(agent);
    const sprite = this.add.sprite(0, -19, 'hc-envelope');
    sim.container.add(sprite);
    sprite.setInteractive({ useHandCursor: true });
    sprite.on('pointerdown', () => bridge.emit('openArtifact', { artifactId: carrying.artifactId }));
    const bob = this.reduced || this.speed > 4 ? null : this.tweens.add({
      targets: sprite, y: { from: -19, to: -21 }, duration: 250, repeat: -1, yoyo: true,
    });
    this.carried.set(agent, { sprite, bob, artifactId: carrying.artifactId });
  }

  private releaseCarried(agent: AgentId) {
    const carried = this.carried.get(agent);
    if (!carried) return;
    carried.bob?.stop();
    carried.sprite.destroy();
    this.carried.set(agent, null);
  }

  /** Carrier arrived: hand the envelope into the receiving building. */
  private absorbEnvelope(agent: AgentId, building: BuildingId) {
    const carried = this.carried.get(agent);
    if (!carried) { this.markReceived(building, ''); return; }
    carried.bob?.stop();
    const sim = this.sims.get(agent);
    const worldX = sim ? sim.container.x + carried.sprite.x : carried.sprite.x;
    const worldY = sim ? sim.container.y + carried.sprite.y : carried.sprite.y;
    carried.sprite.destroy();
    this.carried.set(agent, null);
    if (building === 'plaza') {
      this.spawnPuff({ x: worldX, y: worldY });
      return;
    }
    const point = tilePx(DOOR_ANCHORS[building]);
    const sprite = this.add.sprite(worldX, worldY, 'hc-envelope');
    sprite.setInteractive({ useHandCursor: true });
    sprite.on('pointerdown', () => bridge.emit('openArtifact', { artifactId: carried.artifactId }));
    if (this.reduced) {
      this.spawnPuff(point);
      sprite.destroy();
      this.markReceived(building, carried.artifactId);
      return;
    }
    const counter = { k: 0 };
    const tween = this.tweens.add({
      targets: counter,
      k: 1,
      duration: visualDuration(260, this.speed, 160),
      ease: 'Sine.easeIn',
      onUpdate: () => {
        sprite.setPosition(
          worldX + (point.x - worldX) * counter.k,
          worldY + (point.y - worldY) * counter.k,
        );
        sprite.setAlpha(1 - 0.55 * counter.k);
      },
      onComplete: () => {
        tween.stop();
        sprite.destroy();
        this.flights = this.flights.filter((flight) => flight.sprite !== sprite);
        this.markReceived(building, carried.artifactId);
      },
    });
    this.flights.push({ sprite, tween });
  }

  /** The receiving building takes the envelope in (receive cue landed). */
  private markReceived(building: BuildingId, artifactId: string) {
    if (building === 'plaza') return;
    const key = `${building}:${artifactId}`;
    if (artifactId && this.received.has(key)) return;
    if (artifactId) this.received.add(key);
    const point = tilePx(DOOR_ANCHORS[building as Exclude<BuildingId, 'plaza'>]);
    this.spawnPuff(point);
    void artifactId;
  }

  // --- day/night, lamps, celebration (HC-F-084) -----------------------------------

  setProgress(progress: number) {
    if (!Number.isFinite(progress) || progress === this.progress) return;
    this.progress = Math.max(0, Math.min(1, progress));
    this.nightTween?.stop();
    this.nightTween = null;
    if (this.reduced) this.setNightAlpha();
    else {
      const fromNight = this.nightAlpha;
      const fromLamp = this.lampAlpha;
      const targetNight = this.progress * 0.35;
      const targetLamp = this.progress > 0.7 ? 0.9 : 0;
      const counter = { n: fromNight, l: fromLamp };
      this.nightTween = this.tweens.add({
        targets: counter,
        n: targetNight,
        l: targetLamp,
        duration: 2000,
        ease: 'Sine.easeInOut',
        onUpdate: () => this.setNightAlpha(counter.n, counter.l),
      });
    }
  }

  private setNightAlpha(nextNight?: number, nextLamp?: number) {
    this.nightAlpha = nextNight ?? this.progress * 0.35;
    this.lampAlpha = nextLamp ?? (this.progress > 0.7 ? 0.9 : 0);
    this.night?.setAlpha(this.nightAlpha);
    this.lampGlows?.setAlpha(this.lampAlpha);
  }

  private celebrate(agents: readonly AgentId[]) {
    if (this.celebrating) return;
    this.celebrating = true;
    this.celebrationAgents = agents;
    if (!this.reduced) {
      const spot = tilePx(PLAZA.center);
      const emitter = this.add.particles(spot.x, spot.y - 12, 'hc-dot', {
        speed: { min: 26, max: 66 },
        angle: { min: 205, max: 335 },
        lifespan: { min: 550, max: 1200 },
        scale: { start: 0.8, end: 0.2 },
        alpha: { start: 1, end: 0.5 },
        tint: [0xf2b544, 0x3fb8af, 0xff6b5a, 0x8c6cf2],
        gravityY: 48,
        emitting: false,
      });
      emitter.setDepth(DEPTH_TOP - 40);
      emitter.explode(54);
      this.confetti = emitter;
      this.scheduleEffect(1800, () => {
        emitter.stop();
        this.scheduleEffect(900, () => {
          emitter.destroy();
          if (this.confetti === emitter) this.confetti = null;
        });
      });
    }
  }

  private settleCelebration() {
    for (const agent of this.celebrationAgents) {
      const sim = this.sims.get(agent);
      if (!sim || !sim.container.visible || sim.job || sim.queue.length || this.reduced || this.celebrated.has(agent)) continue;
      this.celebrated.add(agent);
      this.celebrateTweens.push(this.tweens.add({
        targets: sim.container, y: '-=4', duration: 230, yoyo: true, repeat: 3, ease: 'Quad.easeOut',
      }));
    }
  }

  // --- store plumbing ------------------------------------------------------------

  setSpeed(speed: number) {
    if (!Number.isFinite(speed) || speed <= 0) return;
    this.speed = Math.max(0.25, Math.min(20, speed));
    if (this.speed > 4) {
      for (const fx of this.fx.values()) {
        fx.glowTween?.stop();
        fx.glow.setAlpha(fx.activeGlow ? 0.75 : 0);
        fx.alertTween?.stop();
        fx.alertText?.setScale(1);
      }
      for (const carried of this.carried.values()) { carried?.bob?.stop(); carried?.sprite.setY(-19); }
    }
  }

  setReduced(reduced: boolean) {
    this.reduced = reduced;
    for (const sim of this.sims.values()) sim.reduced = reduced;
    if (reduced) this.spawnPuffGuardedKill();
  }

  private spawnPuffGuardedKill() {
    for (const fx of this.fx.values()) {
      if (fx.alertText && fx.alertTween) { fx.alertTween.stop(); fx.alertText.setScale(1); }
      if (fx.glowTween) { fx.glowTween.stop(); fx.glow.setAlpha(0.8); }
    }
  }

  setSelected(agent: AgentId | null) {
    if (this.selected === agent) return;
    const previous = this.selected;
    this.selected = agent;
    if (previous) this.sims.get(previous)?.setSelected(false);
    if (agent) this.sims.get(agent)?.setSelected(true);
  }

  setAgentStatuses(statuses: Record<AgentId, string>) {
    for (const [id, sim] of this.sims) {
      const word = motionWord(statuses[id]);
      if (sim.displayStatus !== word) {
        sim.displayStatus = word;
        if (sim.hover) sim.refreshTag();
      }
    }
  }

  getSimPositions() {
    const out = {} as Record<AgentId, { x: number; y: number }>;
    for (const [id, sim] of this.sims) {
      if (sim.container.visible) out[id] = { x: sim.container.x, y: sim.container.y };
      else {
        const point = tilePx(dockFor(buildingOf(id), id));
        out[id] = { x: point.x, y: point.y };
      }
    }
    return out;
  }

  spawnPuff(point: { x: number; y: number }) {
    if (this.reduced) return;
    for (let i = 0; i < 3; i++) {
      const puff = this.add.circle(point.x, point.y - 4, 3, 0xffffff, 0.65);
      this.puffs.add(puff);
      puff.setDepth(DEPTH_TOP - 35);
      this.tweens.add({
        targets: puff,
        x: point.x + (i - 1) * 5,
        y: point.y - 12 - i * 4,
        scale: { from: 0.6, to: 1.7 },
        alpha: 0,
        duration: 420 + i * 70,
        ease: 'Sine.easeOut',
        onComplete: () => { this.puffs.delete(puff); puff.destroy(); },
      });
    }
  }

  update(_time: number, delta: number) {
    const dt = Math.min(delta, 66);
    const statuses = this.syncSource().statuses;
    for (const [id, sim] of this.sims) {
      sim.update(dt, this.frozen, this.speed);
      const ambient = id !== 'founder' && statuses[id] === 'idle' && !sim.inside && !sim.job && !sim.queue.length
        && this.speed <= 4 && !this.celebrating && !this.frozen && !this.reduced;
      sim.setWander(ambient);
    }
    for (const bubble of this.bubbles) this.positionBubble(bubble);
    if (this.celebrating && !this.frozen) this.settleCelebration();
  }
}
