import type { BuildingId, AgentId } from '@hc/contracts';

export const TILE_SIZE = 16;
export const MAP_COLUMNS = 40;
export const MAP_ROWS = 23;
export const MAP_WIDTH = MAP_COLUMNS * TILE_SIZE;
export const MAP_HEIGHT = MAP_ROWS * TILE_SIZE;

export type TileKind = 'grass' | 'road' | 'plaza' | 'water';
export type TownPoint = Readonly<{ x: number; y: number }>;
export type BuildingSpec = Readonly<{
  id: BuildingId;
  owner: AgentId;
  label: string;
  door: TownPoint;
  bounds: Readonly<{ x: number; y: number; width: number; height: number }>;
  color: string;
}>;

export const BUILDINGS: readonly BuildingSpec[] = [
  { id: 'hall', owner: 'mayor', label: 'CITY HALL', door: { x: 20, y: 5 }, bounds: { x: 16, y: 2, width: 9, height: 4 }, color: '#e5a943' },
  { id: 'library', owner: 'scout', label: 'LIBRARY', door: { x: 7, y: 7 }, bounds: { x: 3, y: 4, width: 9, height: 4 }, color: '#43aaa5' },
  { id: 'workshop', owner: 'maker', label: 'WORKSHOP', door: { x: 32, y: 7 }, bounds: { x: 28, y: 4, width: 9, height: 4 }, color: '#e77a59' },
  { id: 'post', owner: 'herald', label: 'POST OFFICE', door: { x: 32, y: 12 }, bounds: { x: 28, y: 12, width: 9, height: 4 }, color: '#9472cf' },
  { id: 'home', owner: 'founder', label: 'HOME', door: { x: 7, y: 12 }, bounds: { x: 3, y: 12, width: 9, height: 4 }, color: '#eee4d2' },
] as const;

export const BUILDING_BY_ID = Object.fromEntries(BUILDINGS.map((building) => [building.id, building])) as Record<BuildingId, BuildingSpec>;
export const DOOR_ANCHORS = Object.fromEntries(BUILDINGS.map(({ id, door }) => [id, door])) as Record<Exclude<BuildingId, 'plaza'>, TownPoint>;
export const PLAZA = { center: { x: 20, y: 10 }, zone: { left: 13, right: 27, top: 8, bottom: 11 }, board: { x: 24, y: 9 } } as const;
export const SIM_SPAWN_POINTS: Readonly<Record<AgentId, TownPoint>> = {
  mayor: { x: 20, y: 7 }, scout: { x: 7, y: 9 }, maker: { x: 32, y: 9 },
  herald: { x: 32, y: 17 }, founder: { x: 7, y: 17 },
};

// Deliverable slots on City Hall's front steps (17–23, y 6): six tile-sized picks.
export const HALL_STEP_SLOTS: readonly TownPoint[] = [17, 18, 19, 20, 21, 22].map((x) => ({ x, y: 6 }));
// Per-agent idle perches, all inside the plaza zone, each on a clear straight
// lane to the plaza center so waypoint paths can reach (and leave) them.
export const PLAZA_PERCHES: Readonly<Record<AgentId, TownPoint>> = {
  mayor: { x: 20, y: 9 }, scout: { x: 16, y: 10 }, maker: { x: 24, y: 10 }, herald: { x: 20, y: 11 }, founder: { x: 14, y: 10 },
};
export const LAMP_SPOTS: readonly TownPoint[] = [{ x: 15, y: 9 }, { x: 25, y: 9 }];
// Roof anchor per building for artifact pop arcs (top-center of each roof).
export const ROOF_CENTER = Object.fromEntries(BUILDINGS.map(({ id, bounds }) => [id, { x: bounds.x + Math.floor(bounds.width / 2), y: bounds.y }])) as Record<Exclude<BuildingId, 'plaza'>, TownPoint>;

// The decorative fountain sits on plaza tiles; walking never crosses it.
const FOUNTAIN_TILES = new Set(['17,8', '18,8', '19,8', '17,9', '18,9', '19,9']);
export function tileBlocked(x: number, y: number): boolean {
  return FOUNTAIN_TILES.has(`${x},${y}`);
}

const ROAD_CELLS = new Set<string>();
const PLAZA_CELLS = new Set<string>();
const addLine = (x1: number, y1: number, x2: number, y2: number, into: Set<string>) => {
  const dx = Math.sign(x2 - x1);
  const dy = Math.sign(y2 - y1);
  let x = x1;
  let y = y1;
  into.add(`${x},${y}`);
  while (x !== x2 || y !== y2) {
    if (x !== x2) x += dx;
    else y += dy;
    into.add(`${x},${y}`);
  }
};

// The street and footpaths use a compact hand-placed graph. Every door joins it.
addLine(0, 10, 39, 10, ROAD_CELLS);
addLine(20, 5, 20, 10, ROAD_CELLS);
addLine(7, 7, 7, 10, ROAD_CELLS);
addLine(32, 7, 32, 10, ROAD_CELLS);
addLine(7, 10, 7, 12, ROAD_CELLS);
addLine(32, 10, 32, 12, ROAD_CELLS);
addLine(20, 10, 20, 16, ROAD_CELLS);
addLine(7, 12, 7, 16, ROAD_CELLS);
addLine(32, 12, 32, 16, ROAD_CELLS);
for (let y = 8; y <= 11; y++) for (let x = 13; x <= 27; x++) PLAZA_CELLS.add(`${x},${y}`);

export const TOWN_MAP: readonly (readonly TileKind[])[] = Array.from({ length: MAP_ROWS }, (_, y) =>
  Array.from({ length: MAP_COLUMNS }, (_, x): TileKind => {
    if (PLAZA_CELLS.has(`${x},${y}`)) return 'plaza';
    if (ROAD_CELLS.has(`${x},${y}`)) return 'road';
    return 'grass';
  }),
);

export function mapTile(x: number, y: number): TileKind {
  return TOWN_MAP[y]?.[x] ?? 'grass';
}
