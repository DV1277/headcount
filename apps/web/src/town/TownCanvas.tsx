import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { type AgentId } from '@hc/contracts';
import type { Cue } from '@hc/engine';
import { provideSimPositions } from '../bridge';
import { store } from '../data/store';
import { MAP_HEIGHT, MAP_WIDTH, SIM_SPAWN_POINTS, TILE_SIZE, type TownPoint } from './map';
import { TownScene, type SceneRef, type SnapSource, type SyncSource } from './TownScene';
import './TownCanvas.css';

const TOPBAR_PX = 48;
// The canvas renders at 2x the 640x368 map (camera zoom 2) so pixel type stays crisp.
export const RENDER_SCALE = 2;
export type TownCanvasProps = { className?: string };

const spawnPx = (): Record<AgentId, { x: number; y: number }> => {
  const out = {} as Record<AgentId, { x: number; y: number }>;
  for (const [id, tile] of Object.entries(SIM_SPAWN_POINTS) as [AgentId, TownPoint][]) {
    out[id] = { x: tile.x * TILE_SIZE + TILE_SIZE / 2, y: tile.y * TILE_SIZE + TILE_SIZE / 2 };
  }
  return out;
};

const agentStatuses = (): Record<AgentId, string> =>
  Object.fromEntries(Object.entries(store.getState().state.agents).map(([id, agent]) => [id, agent.status])) as Record<AgentId, string>;

export function TownCanvas({ className }: TownCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<SceneRef>({ current: null });
  const state = store((snapshot) => snapshot.state);
  const reducedMotion = store((snapshot) => snapshot.reducedMotion);
  const speed = store((snapshot) => snapshot.speed);
  const selected = store((snapshot) => snapshot.selected);
  const lastSeq = store((snapshot) => snapshot.state.lastSeq);
  const playbackRevision = store((snapshot) => snapshot.playbackRevision);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || gameRef.current || sceneRef.current.current) return;
    const snapSource: SnapSource = () => {
      const current = store.getState();
      return { events: current.events, t: current.state.t };
    };
    const syncSource: SyncSource = () => {
      const current = store.getState();
      return {
        progress: current.state.progress,
        speed: current.speed,
        reduced: current.reducedMotion,
        selected: current.selected,
        statuses: agentStatuses(),
        title: current.state.title,
      };
    };
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      width: MAP_WIDTH * RENDER_SCALE,
      height: MAP_HEIGHT * RENDER_SCALE,
      backgroundColor: '#7bbd79',
      pixelArt: true,
      antialias: false,
      roundPixels: true,
      scale: { mode: Phaser.Scale.ENVELOP, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: new TownScene(sceneRef.current, snapSource, syncSource),
    });
    gameRef.current = game;
    let resizeFrame = 0;
    const refreshScale = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        if (!game.isBooted || !game.canvas || !host.isConnected) return;
        // Phaser's FIT scale uses cached parent dimensions. Read the grid's
        // settled size before refreshing, including panel-only layout changes.
        game.scale.getParentBounds();
        game.scale.refresh();
        // Cover the viewport but keep City Hall's hand-lettered sign clear of the top bar.
        const scale = game.canvas.clientWidth / MAP_WIDTH;
        host.style.setProperty('--town-top', `${TOPBAR_PX - 8 * scale}px`);
      });
    };
    const resizeObserver = new ResizeObserver(refreshScale);
    resizeObserver.observe(host);
    game.events.once(Phaser.Core.Events.READY, refreshScale);
    refreshScale();
    const fallback = spawnPx();
    const publishPositions = () => {
      if (!game.canvas) return;
      provideSimPositions(() => {
        // Read current layout at query time so FIT scaling, centering and later
        // viewport resizes all produce viewport CSS pixels for the HUD bridge.
        const canvas = gameRef.current?.canvas ?? game.canvas;
        const bounds = canvas.getBoundingClientRect();
        const scenePositions = sceneRef.current.current?.getSimPositions() ?? {};
        const positions = { ...fallback, ...scenePositions };
        return Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, {
          x: bounds.left + (point.x * bounds.width) / MAP_WIDTH,
          y: bounds.top + (point.y * bounds.height) / MAP_HEIGHT,
        }])) as Record<AgentId, { x: number; y: number }>;
      });
    };
    publishPositions();
    game.events.once(Phaser.Core.Events.READY, publishPositions);
    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(resizeFrame);
      game.events.off(Phaser.Core.Events.READY, refreshScale);
      game.events.off(Phaser.Core.Events.READY, publishPositions);
      game.destroy(true);
      gameRef.current = null;
      sceneRef.current.current = null;
    };
  }, []);

  // Cue stream: immediate cues fire now, queued ones ride the per-agent FIFO.
  // Cues that arrive before the scene registers are already folded into the
  // store's event log, which the scene replays on create (see snap()).
  useEffect(() => {
    let stopped = false;
    const stop = store.getState().cues$((cue: Cue) => {
      if (stopped) return;
      sceneRef.current.current?.handleCue(cue);
    });
    return () => {
      stopped = true;
      stop();
    };
  }, []);

  useEffect(() => {
    sceneRef.current.current?.setProgress(state.progress);
  }, [state.progress]);
  useEffect(() => {
    sceneRef.current.current?.setSpeed(speed);
  }, [speed]);
  useEffect(() => {
    sceneRef.current.current?.setReduced(reducedMotion);
  }, [reducedMotion]);
  useEffect(() => {
    sceneRef.current.current?.setBoardTitle(state.title);
  }, [state.title, playbackRevision]);
  useEffect(() => {
    sceneRef.current.current?.setSelected(selected);
  }, [selected]);
  useEffect(() => {
    // Hover tags mirror the reduced agents' status (plain words, HC-N-033).
    sceneRef.current.current?.setAgentStatuses(agentStatuses());
  }, [lastSeq]);
  useEffect(() => {
    // Load, seek, reconnect and back-to-live all bump playbackRevision; the
    // town snaps to the reduced state instead of replaying cues.
    sceneRef.current.current?.snap();
  }, [playbackRevision]);

  return (
    <div className={className ? `hc-town ${className}` : 'hc-town'}
      ref={hostRef}
      role="img"
      aria-label="Headcount town: City Hall, Library, Workshop, Post Office and Home with five residents"
      data-progress={state.progress} />
  );
}

export default TownCanvas;
