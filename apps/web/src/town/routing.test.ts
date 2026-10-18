import { describe, expect, it } from 'vitest';
import { DOOR_PARK, dockFor, pathOnGraph, walkPath } from './routing';
import { DOOR_ANCHORS, BUILDINGS, MAP_COLUMNS, MAP_ROWS, PLAZA_PERCHES, SIM_SPAWN_POINTS } from './map';

const docks = Object.values(DOOR_PARK);

describe('town waypoint routing', () => {
  it('every building dock reaches every other building dock', () => {
    for (const from of docks) {
      for (const to of docks) {
        const path = walkPath(from, to);
        expect(path, `${from.x},${from.y} -> ${to.x},${to.y}`).not.toBeNull();
        expect(path![0]).toEqual(from);
        expect(path![path!.length - 1]).toEqual(to);
      }
    }
  });

  it('every spawn reaches its own building dock and every other dock', () => {
    for (const spawn of Object.values(SIM_SPAWN_POINTS)) {
      for (const dock of docks) {
        expect(walkPath(spawn, dock), `${spawn.x},${spawn.y} -> ${dock.x},${dock.y}`).not.toBeNull();
      }
    }
  });

  it('plaza perches are reachable from building docks both ways', () => {
    for (const perch of Object.values(PLAZA_PERCHES)) {
      for (const dock of docks) {
        expect(walkPath(dock, perch), `${dock.x},${dock.y} -> ${perch.x},${perch.y}`).not.toBeNull();
        expect(walkPath(perch, dock)).not.toBeNull();
      }
    }
  });

  it('node-to-node routes stay on graph nodes or porch tiles', () => {
    const path = walkPath(SIM_SPAWN_POINTS.scout, SIM_SPAWN_POINTS.herald);
    expect(path).not.toBeNull();
    expect(pathOnGraph(path!)).toBe(true);
    const back = walkPath(DOOR_ANCHORS.home, PLAZA_PERCHES.mayor);
    expect(back).not.toBeNull();
    expect(pathOnGraph(back!)).toBe(true);
  });

  it('a same-dock walk is a no-op path', () => {
    expect(walkPath(DOOR_PARK.hall, DOOR_PARK.hall)).toEqual([DOOR_PARK.hall]);
  });

  it('walk home ends beside the home door', () => {
    const path = walkPath(DOOR_PARK.post, DOOR_PARK.home);
    expect(path).not.toBeNull();
    const end = path![path!.length - 1];
    expect(end).toEqual(DOOR_PARK.home);
    expect(Math.abs(end.y - DOOR_ANCHORS.home.y)).toBe(1);
  });

  it('dockFor maps plaza walks to perches and buildings to parks', () => {
    expect(dockFor('plaza', 'maker')).toEqual(PLAZA_PERCHES.maker);
    expect(dockFor('hall', 'mayor')).toEqual(DOOR_PARK.hall);
  });

  it('all docks sit in bounds on lanes that lead to City Hall', () => {
    for (const park of [...docks, ...Object.values(PLAZA_PERCHES)]) {
      expect(park.x).toBeLessThan(MAP_COLUMNS);
      expect(park.y).toBeLessThan(MAP_ROWS);
      const isDoor = BUILDINGS.some((b) => b.door.x === park.x && b.door.y === park.y);
      expect(isDoor || walkPath(park, DOOR_PARK.hall) !== null).toBe(true);
    }
  });
});
