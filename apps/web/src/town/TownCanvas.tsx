import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Phaser from 'phaser';
import { ROSTER, type AgentId } from '@hc/contracts';
import { provideSimPositions } from '../bridge';
import { store, useStore } from '../data/store';
import { BUILDINGS, MAP_HEIGHT, MAP_WIDTH, PLAZA, SIM_SPAWN_POINTS, TILE_SIZE, TOWN_MAP, type TownPoint } from './map';
import './TownCanvas.css';

const ASSET_ROOT = '/assets/kenney/tiny-town/Tiles';

class TownScene extends Phaser.Scene {
  constructor() { super('town'); }

  preload() {
    this.load.image('grass-0', `${ASSET_ROOT}/tile_0000.png`);
    this.load.image('grass-1', `${ASSET_ROOT}/tile_0001.png`);
    this.load.image('flowers', `${ASSET_ROOT}/tile_0002.png`);
    this.load.image('tree', `${ASSET_ROOT}/tile_0005.png`);
    this.load.image('path', `${ASSET_ROOT}/tile_0013.png`);
    this.load.image('path-edge', `${ASSET_ROOT}/tile_0012.png`);
    this.load.image('plaza-stone', `${ASSET_ROOT}/tile_0036.png`);
  }

  create() {
    this.cameras.main.setBackgroundColor('#7bbd79');
    this.drawGround();
    this.drawDecor();
    this.drawBuildings();
    this.drawNoticeBoard();
    this.drawResidents();
  }

  private drawGround() {
    for (let y = 0; y < TOWN_MAP.length; y++) {
      for (let x = 0; x < TOWN_MAP[y].length; x++) {
        const kind = TOWN_MAP[y][x];
        let key = 'grass-0';
        if (kind === 'road') key = 'path';
        if (kind === 'plaza') key = 'plaza-stone';
        const tile = this.add.image(x * TILE_SIZE, y * TILE_SIZE, key).setOrigin(0);
        tile.setDisplaySize(TILE_SIZE, TILE_SIZE);
        tile.setDepth(0);
        if (kind === 'grass' && (x * 13 + y * 7) % 5 === 0) tile.setTexture('grass-1');
      }
    }
    const edge = this.add.graphics();
    edge.fillStyle(0x416c52, 1);
    edge.fillRect(0, 0, MAP_WIDTH, TILE_SIZE);
    edge.fillRect(0, MAP_HEIGHT - TILE_SIZE, MAP_WIDTH, TILE_SIZE);
    edge.setDepth(1);
  }

  private drawDecor() {
    for (let y = 1; y < MAP_HEIGHT / TILE_SIZE - 1; y += 3) {
      for (let x = 1; x < MAP_WIDTH / TILE_SIZE - 1; x += 4) {
        if (TOWN_MAP[y][x] !== 'grass' || this.nearBuilding(x, y)) continue;
        const key = (x * 11 + y * 17) % 7 === 0 ? 'flowers' : 'tree';
        const scale = key === 'tree' ? 1 : 0.75;
        this.add.image(x * TILE_SIZE + 8, y * TILE_SIZE + 8, key).setScale(scale).setDepth((y + 1) * TILE_SIZE);
      }
    }
    // A blue ribbon of water and a small fountain make the square easy to read.
    const water = this.add.graphics();
    water.fillStyle(0x6fc4c8, 1);
    water.fillRect(18 * TILE_SIZE, 9 * TILE_SIZE, 3 * TILE_SIZE, 2 * TILE_SIZE);
    water.fillStyle(0xc7f1df, 1);
    water.fillRect(19 * TILE_SIZE, 9 * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    water.lineStyle(1, 0x3e7f84, 1);
    water.strokeRect(18 * TILE_SIZE, 9 * TILE_SIZE, 3 * TILE_SIZE, 2 * TILE_SIZE);
    water.setDepth(10 * TILE_SIZE + 2);
    this.add.image(19 * TILE_SIZE, 8 * TILE_SIZE, 'path-edge').setOrigin(0).setDisplaySize(TILE_SIZE, TILE_SIZE).setDepth(10 * TILE_SIZE + 3);

    for (const x of [15, 25]) {
      const lamp = this.add.graphics();
      lamp.fillStyle(0x624b38, 1).fillRect(x * TILE_SIZE + 7, 9 * TILE_SIZE + 2, 2, 11);
      lamp.fillStyle(0xffd57c, 1).fillRect(x * TILE_SIZE + 4, 9 * TILE_SIZE, 8, 5);
      lamp.fillStyle(0xffedb2, 1).fillRect(x * TILE_SIZE + 6, 9 * TILE_SIZE + 1, 4, 3);
      lamp.setDepth(10 * TILE_SIZE + 4);
    }
  }

  private drawBuildings() {
    for (const building of BUILDINGS) {
      const { x, y, width, height } = building.bounds;
      const bx = x * TILE_SIZE;
      const by = y * TILE_SIZE;
      const bw = width * TILE_SIZE;
      const bh = height * TILE_SIZE;
      const g = this.add.graphics().setDepth((y + height) * TILE_SIZE - 1);

      // Soft cast shadow, timber frame, warm plaster, and a tiled roof.
      g.fillStyle(0x354d40, 0.3).fillRect(bx + 3, by + 5, bw, bh);
      g.fillStyle(0x533d35, 1).fillRect(bx, by + 8, bw, bh - 5);
      g.fillStyle(Phaser.Display.Color.HexStringToColor(building.color).color, 1).fillRect(bx + 3, by + 12, bw - 6, bh - 12);
      g.fillStyle(0x5f4741, 1).fillRect(bx - 3, by + 6, bw + 6, 7);
      g.fillStyle(0x765047, 1).fillRect(bx + 3, by, bw - 6, 8);
      g.fillStyle(0x9a6550, 1).fillRect(bx + 6, by + 2, bw - 12, 2);
      g.fillStyle(0xe5c17f, 1).fillRect(bx + 4, by + 12, 2, bh - 12);
      g.fillStyle(0xe5c17f, 1).fillRect(bx + bw - 6, by + 12, 2, bh - 12);

      const windowY = by + 18;
      for (const wx of [bx + 10, bx + bw - 18]) {
        g.fillStyle(0x493b41, 1).fillRect(wx, windowY, 8, 9);
        g.fillStyle(0xffe5a0, 1).fillRect(wx + 2, windowY + 2, 4, 5);
        g.fillStyle(0x765047, 1).fillRect(wx + 3, windowY + 1, 2, 7);
        g.fillStyle(0x765047, 1).fillRect(wx + 1, windowY + 3, 6, 1);
      }

      const door = building.door;
      const doorX = door.x * TILE_SIZE;
      const doorY = door.y * TILE_SIZE;
      g.fillStyle(0x493b41, 1).fillRect(doorX - 5, doorY - 8, 10, 13);
      g.fillStyle(0xa96f46, 1).fillRect(doorX - 3, doorY - 6, 6, 11);
      g.fillStyle(0xf1d896, 1).fillRect(doorX + 1, doorY - 1, 1, 1);
      g.fillStyle(0xf4e8c9, 1).fillRect(bx + bw / 2 - 35, by - 8, 70, 10);
      g.lineStyle(1, 0x59413b, 1).strokeRect(bx + bw / 2 - 35, by - 8, 70, 10);
      const label = this.add.text(bx + bw / 2, by - 7, building.label, {
        fontFamily: 'Pixelify Sans, monospace', fontSize: '7px', color: '#342e3d', fontStyle: 'bold',
      }).setOrigin(0.5, 0).setDepth((y + height) * TILE_SIZE + 1);
      label.setResolution(2);

    }
  }

  private drawNoticeBoard() {
    const x = PLAZA.board.x * TILE_SIZE;
    const y = PLAZA.board.y * TILE_SIZE;
    const board = this.add.graphics().setDepth(y + 10);
    board.fillStyle(0x624832, 1).fillRect(x + 4, y + 2, 3, 12);
    board.fillStyle(0x8a6242, 1).fillRect(x - 2, y - 3, 17, 10);
    board.lineStyle(1, 0xf0d093, 1).strokeRect(x - 2, y - 3, 17, 10);
    board.fillStyle(0xf6e5b8, 1).fillRect(x + 1, y, 11, 2);
    board.fillStyle(0xdba759, 1).fillRect(x + 1, y + 4, 8, 1);
    this.add.text(x + 6, y - 2, 'OPEN', { fontFamily: 'Pixelify Sans, monospace', fontSize: '5px', color: '#362e31' }).setOrigin(0.5, 0).setDepth(y + 11);
  }

  private drawResidents() {
    const positions = Object.entries(SIM_SPAWN_POINTS) as [AgentId, TownPoint][];
    positions.forEach(([id, point], i) => {
      const x = point.x;
      const y = point.y;
      const person = ROSTER[id];
      const px = x * TILE_SIZE + TILE_SIZE / 2;
      const py = y * TILE_SIZE + TILE_SIZE / 2;
      const g = this.add.graphics().setDepth(py + 4);
      const color = Phaser.Display.Color.HexStringToColor(person.color).color;
      g.fillStyle(0x253c34, 0.22).fillEllipse(px, py + 5, 12, 5);
      g.fillStyle(color, 1).fillCircle(px, py + 4, 7);
      g.fillStyle(0xf4e8d5, 1).fillCircle(px, py, 5);
      g.fillStyle([0x50465d, 0x2f514c, 0x61423a, 0x4c3b65, 0x56463b][i], 1).fillRect(px - 4, py - 5, 8, 2);
      g.fillStyle(0x332f3c, 1).fillRect(px - 3, py - 1, 1, 1);
      g.fillStyle(0x332f3c, 1).fillRect(px + 2, py - 1, 1, 1);
      const tag = this.add.graphics().setDepth(py + 5);
      tag.fillStyle(0x211e2b, 0.9).fillRoundedRect(px - 19, py + 12, 38, 10, 2);
      this.add.text(px, py + 13, person.name, { fontFamily: 'Pixelify Sans, monospace', fontSize: '6px', color: '#fff4df' }).setOrigin(0.5, 0).setDepth(py + 6);
    });
  }

  private nearBuilding(x: number, y: number) {
    return BUILDINGS.some(({ bounds }) => x >= bounds.x - 1 && x < bounds.x + bounds.width + 1 && y >= bounds.y - 1 && y < bounds.y + bounds.height + 1);
  }
}

export type TownCanvasProps = { className?: string };

export function TownCanvas({ className }: TownCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [workspace, setWorkspace] = useState<HTMLElement | null>(null);
  const state = useStore((snapshot) => snapshot.state);

  useEffect(() => {
    setWorkspace(document.querySelector<HTMLElement>('.hc-workspace'));
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || gameRef.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      backgroundColor: '#7bbd79',
      pixelArt: true,
      antialias: false,
      roundPixels: true,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: TownScene,
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
      });
    };
    const resizeObserver = new ResizeObserver(refreshScale);
    resizeObserver.observe(host);
    game.events.once(Phaser.Core.Events.READY, refreshScale);
    refreshScale();
    const publishPositions = () => {
      if (!game.canvas) return;
      provideSimPositions(() => {
        // Read current layout at query time so FIT scaling, centering and later
        // viewport resizes all produce viewport CSS pixels for the HUD bridge.
        const canvas = gameRef.current?.canvas ?? game.canvas;
        const bounds = canvas.getBoundingClientRect();
        return Object.fromEntries(Object.entries(SIM_SPAWN_POINTS).map(([id, point]) => [id, {
          x: bounds.left + (point.x * TILE_SIZE + TILE_SIZE / 2) * bounds.width / MAP_WIDTH,
          y: bounds.top + (point.y * TILE_SIZE + TILE_SIZE / 2) * bounds.height / MAP_HEIGHT,
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
    };
  }, [workspace]);

  useEffect(() => {
    // The event stream is deliberately connected at the canvas boundary. The cue
    // player lands in the next town phase; this scaffold safely consumes no cues.
    const stop = store.getState().cues$(() => undefined);
    return stop;
  }, []);

  return (
    workspace ? createPortal(
      <div className={className ? `hc-town ${className}` : 'hc-town'} ref={hostRef} role="img" aria-label="Static Headcount town map with City Hall, Library, Workshop, Post Office and Home" data-progress={state.progress}>
        <span className="hc-town-caption">{state.title || 'A little town, ready for work'}</span>
      </div>, workspace,
    ) : null
  );
}

export default TownCanvas;
