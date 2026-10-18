import type { AgentId, BuildingId } from '@hc/contracts';
import { DOOR_ANCHORS, mapTile, PLAZA, PLAZA_PERCHES, SIM_SPAWN_POINTS, tileBlocked, type TownPoint } from './map';

// Waypoint graph per PRD §10.6: nodes at every door, spawn, road junction, the
// plaza center and the per-agent plaza perches. Edges are straight lanes whose
// tiles are streets or open plaza (fountain excluded). BFS over nodes; no tile
// level pathfinding. Buildings whose doors face north (post, home) park Sims
// one tile north of the door so the doorway stays clear of the facade.

const key = (p: TownPoint) => `${p.x},${p.y}`;
const point = (x: number, y: number): TownPoint => ({ x, y });

/** Where a Sim parks in front of `building` (door itself or one safe step away). */
export const DOOR_PARK: Readonly<Record<Exclude<BuildingId, 'plaza'>, TownPoint>> = {
  hall: { x: 20, y: 6 },      // south facade: step down into the street lane
  library: { x: 7, y: 8 },    // south facade: step down into the footpath
  workshop: { x: 32, y: 8 },  // south facade: step down into the footpath
  post: { x: 32, y: 11 },     // north facade: stop on the lane above the door
  home: { x: 7, y: 11 },      // north facade: stop on the lane above the door
};

const JUNCTIONS: readonly TownPoint[] = [
  point(0, 10), point(39, 10),
  point(7, 10), point(20, 10), point(32, 10),
  point(7, 16), point(20, 16), point(32, 16),
];

export const NODES: readonly TownPoint[] = (() => {
  const seen = new Set<string>();
  const list: TownPoint[] = [];
  const push = (p: TownPoint) => {
    const k = key(p);
    if (!seen.has(k)) { seen.add(k); list.push(p); }
  };
  for (const door of Object.values(DOOR_ANCHORS)) push(door);
  for (const spawn of Object.values(SIM_SPAWN_POINTS)) push(spawn);
  for (const junction of JUNCTIONS) push(junction);
  push(PLAZA.center);
  for (const perch of Object.values(PLAZA_PERCHES)) push(perch);
  return list;
})();

const NODE_SET = new Set(NODES.map(key));

// Corners the Sims step over when standing in front of their buildings.
const PORCH_TILES = new Set(Object.values(SIM_SPAWN_POINTS).map(key));

function tileWalkable(x: number, y: number): boolean {
  const kind = mapTile(x, y);
  if (kind === 'road') return true;
  if (kind === 'plaza') return !tileBlocked(x, y);
  return PORCH_TILES.has(`${x},${y}`);
}

/**
 * straight lane from a to b (sharing exactly one axis) where every stepped tile
 * is walkable (`/includes both endpoints`).
 */
export function laneWalkable(a: TownPoint, b: TownPoint): boolean {
  if (a.x !== b.x && a.y !== b.y) return false;
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  for (let x = a.x, y = a.y; ; x += dx, y += dy) {
    if (!tileWalkable(x, y)) return false;
    if (x === b.x && y === b.y) break;
  }
  return true;
}

const adjacency: Map<string, string[]> = (() => {
  const map = new Map<string, string[]>();
  const link = (a: TownPoint, b: TownPoint) => {
    if (!laneWalkable(a, b)) return;
    (map.get(key(a)) ?? map.set(key(a), []).get(key(a))!).push(key(b));
    (map.get(key(b)) ?? map.set(key(b), []).get(key(b))!).push(key(a));
  };
  for (let i = 0; i < NODES.length; i++) {
    for (let j = i + 1; j < NODES.length; j++) {
      if (NODES[i].x === NODES[j].x || NODES[i].y === NODES[j].y) link(NODES[i], NODES[j]);
    }
  }
  // Keep adjacency deterministic: sort each neighbor list by node order.
  const order = new Map(NODES.map((n, i) => [key(n), i]));
  for (const list of map.values()) list.sort((p, q) => order.get(p)! - order.get(q)!);
  return map;
})();

function neighbors(p: TownPoint): TownPoint[] {
  return (adjacency.get(key(p)) ?? []).map((k) => {
    const [x, y] = k.split(',').map(Number);
    return point(x, y);
  });
}

/** Where a walk targeting `building` parks for `agent` (perch for the plaza). */
export function dockFor(building: BuildingId, agent: AgentId): TownPoint {
  if (building === 'plaza') return PLAZA_PERCHES[agent];
  return DOOR_PARK[building as Exclude<BuildingId, 'plaza'>];
}

/** Is `p` a registered graph node. */
export const isNode = (p: TownPoint) => NODE_SET.has(key(p));

/** Nearest graph node to `p` by Manhattan distance with a clear straight lane. */
export function nearestNode(p: TownPoint): TownPoint | null {
  const candidates = NODES
    .filter((n) => n.x === p.x || n.y === p.y)
    .filter((n) => laneWalkable(p, n))
    .sort((a, b) => (Math.abs(a.x - p.x) + Math.abs(a.y - p.y)) - (Math.abs(b.x - p.x) + Math.abs(b.y - p.y)));
  return candidates[0] ?? null;
}

/**
 * Waypoint path between graph nodes (inclusive), through the nearest reachable
 * node when `from` drifted off the graph (idle wander). When `to` is a port
 * tile next to the graph (park step or perch wing), the path routes to a
 * connected node and closes with the straight final step. Returns `null` when
 * truly cut off, so callers can fade-teleport instead.
 */
export function walkPath(from: TownPoint, to: TownPoint): TownPoint[] | null {
  if (from.x === to.x && from.y === to.y) return [from];
  let goal = to;
  const suffix: TownPoint[] = [];
  if (!NODE_SET.has(key(to))) {
    const entry = NODES
      .filter((n) => laneWalkable(to, n))
      .sort((a, b) => (Math.abs(a.x - from.x) + Math.abs(a.y - from.y)) - (Math.abs(b.x - from.x) + Math.abs(b.y - from.y)))[0];
    if (!entry) return null;
    suffix.push(to);
    goal = entry;
  }
  let start = from;
  const prefix: TownPoint[] = [from];
  if (!NODE_SET.has(key(from))) {
    const snapped = nearestNode(from);
    if (!snapped) return null;
    prefix.push(snapped);
    start = snapped;
  }
  if (start.x === goal.x && start.y === goal.y) {
    return suffix.length > 0 ? [...prefix, ...suffix] : prefix;
  }
  const prev = new Map<string, string | null>([[key(start), null]]);
  const order: TownPoint[] = [start];
  let head = 0;
  let found = false;
  while (head < order.length) {
    const current = order[head++];
    if (current.x === goal.x && current.y === goal.y) { found = true; break; }
    for (const next of neighbors(current)) {
      if (prev.has(key(next))) continue;
      prev.set(key(next), key(current));
      order.push(next);
    }
  }
  if (!found) return null;
  const current = order[head - 1];
  const reversed: TownPoint[] = [];
  let cursor: string | null = key(current);
  while (cursor) {
    const [x, y] = cursor.split(',').map(Number);
    reversed.push(point(x, y));
    cursor = prev.get(cursor) ?? null;
  }
  const path = reversed.reverse();
  path.shift(); // drop the snapped start; it is already the `prefix` tail
  return [...prefix, ...path, ...suffix];
}

/** Emission check for tests and safety assertions: every lane stays on graph. */
export function pathOnGraph(path: readonly TownPoint[]): boolean {
  return path.every((p) => NODE_SET.has(key(p)) || PORCH_TILES.has(key(p)));
}
