# Procgen V2 - Plan d'Implémentation Complet

> Ce document contient le plan d'implémentation pour toutes les améliorations identifiées lors de la counter-analysis.
> Dernière mise à jour: 2025-01-11

---

## Table des Matières

1. [Vue d'Ensemble](#vue-densemble)
2. [Phase 1: Corrections Critiques](#phase-1-corrections-critiques)
3. [Phase 2: Améliorations de Qualité](#phase-2-améliorations-de-qualité)
4. [Phase 3: Nouvelles Fonctionnalités](#phase-3-nouvelles-fonctionnalités)
5. [Phase 4: Niveau Masterpiece](#phase-4-niveau-masterpiece)
6. [Dépendances et Ordre d'Exécution](#dépendances-et-ordre-dexécution)
7. [Tests Requis](#tests-requis)

---

## Vue d'Ensemble

### Statut Actuel
Le package procgen-v2 est fonctionnel avec:
- ✅ BSP Generator avec passes composables
- ✅ Cellular Automata Generator
- ✅ Decision tracing
- ✅ FNV64 checksum (64-bit)
- ✅ Room type semantics (entrance, exit, boss, treasure)
- ✅ AbortSignal support
- ✅ Invariant validation
- ✅ Generator chaining API
- ✅ Artifact snapshots

### Améliorations Restantes (16 items)

| Phase | Item | Effort | Impact |
|-------|------|--------|--------|
| 1 | Fix room center walkability | 1h | Critique |
| 1 | Fix corridor crossing detection | 2h | Haute |
| 1 | Fix spawn re-validation | 1h | Moyenne |
| 2 | Dijkstra maps utility | 4h | Haute |
| 2 | Delaunay edge case handling | 2h | Moyenne |
| 2 | Property-based testing | 4h | Haute |
| 2 | Path compression for connections | 2h | Moyenne |
| 3 | Lock-and-key pattern support | 8h | Haute |
| 3 | Algorithm fragment extraction | 8h | Haute |
| 3 | Rule engine integration | 16h | Haute |
| 3 | Hybrid algorithm composition | 6h | Moyenne |
| 4 | Generation metrics dashboard | 8h | Moyenne |
| 4 | Enhanced decision provenance | 6h | Moyenne |
| 4 | Visual debugging integration | 4h | Moyenne |
| 4 | Parameter sweeping API | 4h | Basse |
| 4 | Cross-platform determinism tests | 4h | Moyenne |

**Effort Total Estimé: ~80 heures**

---

## Phase 1: Corrections Critiques

### 1.1 Fix Room Center Walkability

**Problème:** `validateDungeon` assume que `room.centerX/centerY` est une tuile floor, ce qui est faux pour les caves cellular.

**Fichiers à modifier:**
- `src/generators/cellular/passes.ts` (lignes 203-216)
- `src/generators/bsp/passes.ts` (lignes 273-283)

**Implémentation:**

```typescript
// src/core/grid/utils.ts (nouveau fichier)

import { Grid, CellType } from "./grid";
import type { Point } from "../geometry/types";

/**
 * Find the nearest floor tile to a given point using BFS
 */
export function findNearestFloor(
  grid: Grid,
  x: number,
  y: number,
  maxRadius: number = 50
): Point | null {
  // If the point itself is floor, return it
  if (grid.get(x, y) === CellType.FLOOR) {
    return { x, y };
  }

  // BFS spiral search
  const visited = new Set<string>();
  const queue: Array<{ x: number; y: number; dist: number }> = [{ x, y, dist: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = `${current.x},${current.y}`;

    if (visited.has(key)) continue;
    visited.add(key);

    if (current.dist > maxRadius) continue;

    if (grid.isInBounds(current.x, current.y) &&
        grid.get(current.x, current.y) === CellType.FLOOR) {
      return { x: current.x, y: current.y };
    }

    // Add neighbors
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (grid.isInBounds(nx, ny)) {
        queue.push({ x: nx, y: ny, dist: current.dist + 1 });
      }
    }
  }

  return null;
}
```

**Modifications dans cellular/passes.ts:**

```typescript
// Dans keepLargestRegion(), ligne ~205
import { findNearestFloor } from "../../core/grid/utils";

// Remplacer:
// centerX: Math.floor((bounds.minX + bounds.maxX) / 2),
// centerY: Math.floor((bounds.minY + bounds.maxY) / 2),

// Par:
const geometricCenterX = Math.floor((bounds.minX + bounds.maxX) / 2);
const geometricCenterY = Math.floor((bounds.minY + bounds.maxY) / 2);
const walkableCenter = findNearestFloor(grid, geometricCenterX, geometricCenterY);

rooms.push({
  id: 0,
  x: bounds.minX,
  y: bounds.minY,
  width: bounds.maxX - bounds.minX + 1,
  height: bounds.maxY - bounds.minY + 1,
  centerX: walkableCenter?.x ?? geometricCenterX,
  centerY: walkableCenter?.y ?? geometricCenterY,
  type: "cavern",
  seed: Math.floor(ctx.streams.rooms.next() * 0xffffffff),
});
```

**Tests à ajouter:**

```typescript
// tests/grid-utils.test.ts
describe("findNearestFloor", () => {
  it("returns point if already floor", () => {
    const grid = new Grid(10, 10, CellType.WALL);
    grid.set(5, 5, CellType.FLOOR);
    expect(findNearestFloor(grid, 5, 5)).toEqual({ x: 5, y: 5 });
  });

  it("finds nearest floor from wall", () => {
    const grid = new Grid(10, 10, CellType.WALL);
    grid.set(7, 5, CellType.FLOOR);
    const result = findNearestFloor(grid, 5, 5);
    expect(result).toEqual({ x: 7, y: 5 });
  });

  it("returns null if no floor within radius", () => {
    const grid = new Grid(10, 10, CellType.WALL);
    expect(findNearestFloor(grid, 5, 5, 10)).toBeNull();
  });
});
```

---

### 1.2 Fix Corridor Crossing Detection

**Problème:** Les corridors L-shaped peuvent croiser d'autres corridors, créant des raccourcis non intentionnels.

**Fichiers à modifier:**
- `src/generators/bsp/passes.ts` (lignes 617-669)
- `src/passes/connectivity/` (nouveau)

**Option A: Détection post-hoc (Recommandée)**

```typescript
// src/passes/connectivity/crossing-detector.ts (nouveau fichier)

import type { Connection, Room } from "../../pipeline/types";
import type { Point } from "../../core/geometry/types";

interface CrossingInfo {
  connection1: Connection;
  connection2: Connection;
  intersectionPoint: Point;
}

/**
 * Detect corridor crossings that create unintended graph edges
 */
export function detectCorridorCrossings(
  connections: readonly Connection[]
): CrossingInfo[] {
  const crossings: CrossingInfo[] = [];

  for (let i = 0; i < connections.length; i++) {
    for (let j = i + 1; j < connections.length; j++) {
      const c1 = connections[i]!;
      const c2 = connections[j]!;

      // Skip if connections share a room (expected to touch)
      if (c1.fromRoomId === c2.fromRoomId ||
          c1.fromRoomId === c2.toRoomId ||
          c1.toRoomId === c2.fromRoomId ||
          c1.toRoomId === c2.toRoomId) {
        continue;
      }

      // Check for path intersection
      const intersection = findPathIntersection(c1.path, c2.path);
      if (intersection) {
        crossings.push({
          connection1: c1,
          connection2: c2,
          intersectionPoint: intersection,
        });
      }
    }
  }

  return crossings;
}

function findPathIntersection(
  path1: readonly Point[],
  path2: readonly Point[]
): Point | null {
  const set1 = new Set(path1.map(p => `${p.x},${p.y}`));

  for (const point of path2) {
    if (set1.has(`${point.x},${point.y}`)) {
      return point;
    }
  }

  return null;
}

/**
 * Build actual connectivity graph including crossings
 */
export function buildActualConnectivityGraph(
  rooms: readonly Room[],
  connections: readonly Connection[]
): Map<number, Set<number>> {
  const graph = new Map<number, Set<number>>();

  // Initialize
  for (const room of rooms) {
    graph.set(room.id, new Set());
  }

  // Add explicit connections
  for (const conn of connections) {
    graph.get(conn.fromRoomId)?.add(conn.toRoomId);
    graph.get(conn.toRoomId)?.add(conn.fromRoomId);
  }

  // Add implicit connections from crossings
  const crossings = detectCorridorCrossings(connections);
  for (const crossing of crossings) {
    // These rooms are now implicitly connected
    const rooms1 = [crossing.connection1.fromRoomId, crossing.connection1.toRoomId];
    const rooms2 = [crossing.connection2.fromRoomId, crossing.connection2.toRoomId];

    for (const r1 of rooms1) {
      for (const r2 of rooms2) {
        if (r1 !== r2) {
          graph.get(r1)?.add(r2);
          graph.get(r2)?.add(r1);
        }
      }
    }
  }

  return graph;
}
```

**Option B: A* Corridor Carving (Plus coûteuse)**

```typescript
// src/passes/carving/astar-corridor.ts

import { Grid, CellType } from "../../core/grid";
import type { Point } from "../../core/geometry/types";
import { PriorityQueue } from "../../core/data-structures/priority-queue";

interface AStarOptions {
  avoidExistingFloors: boolean;
  floorPenalty: number; // Cost multiplier for crossing existing floors
}

export function carveCorridorAStar(
  grid: Grid,
  from: Point,
  to: Point,
  options: AStarOptions = { avoidExistingFloors: true, floorPenalty: 10 }
): Point[] {
  const openSet = new PriorityQueue<{ point: Point; f: number }>(
    (a, b) => a.f - b.f
  );
  const cameFrom = new Map<string, Point>();
  const gScore = new Map<string, number>();
  const key = (p: Point) => `${p.x},${p.y}`;

  gScore.set(key(from), 0);
  openSet.push({ point: from, f: heuristic(from, to) });

  while (!openSet.isEmpty()) {
    const current = openSet.pop()!.point;

    if (current.x === to.x && current.y === to.y) {
      return reconstructPath(cameFrom, current);
    }

    for (const neighbor of getNeighbors(grid, current)) {
      const tentativeG = (gScore.get(key(current)) ?? Infinity) +
        getCost(grid, neighbor, options);

      if (tentativeG < (gScore.get(key(neighbor)) ?? Infinity)) {
        cameFrom.set(key(neighbor), current);
        gScore.set(key(neighbor), tentativeG);
        openSet.push({
          point: neighbor,
          f: tentativeG + heuristic(neighbor, to),
        });
      }
    }
  }

  // Fallback to L-shaped if no path found
  return carveLShaped(from, to);
}

function getCost(grid: Grid, point: Point, options: AStarOptions): number {
  if (options.avoidExistingFloors && grid.get(point.x, point.y) === CellType.FLOOR) {
    return options.floorPenalty;
  }
  return 1;
}

function heuristic(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
```

**Décision:** Implémenter Option A d'abord (détection), puis Option B si les crossings deviennent problématiques.

---

### 1.3 Fix Spawn Re-validation

**Problème:** Les spawns sont validés pendant la génération mais pas après les post-processors.

**Fichiers à modifier:**
- `src/pipeline/chaining.ts` (lignes 310-320)
- `src/index.ts` (validateDungeon)

**Implémentation:**

```typescript
// src/pipeline/chaining.ts - Modifier run()

run(options?: Omit<PipelineOptions, "signal">): PipelineResult<DungeonArtifact> {
  // ... existing code ...

  // Apply sync post-processors
  let artifact = result.artifact;
  try {
    for (const processor of this.postProcessors) {
      artifact = processor(artifact, this.config.seed);
    }

    // NEW: Re-validate spawns after all transformations
    artifact = this.revalidateSpawns(artifact);

  } catch (error) {
    // ...
  }
  // ...
}

private revalidateSpawns(dungeon: DungeonArtifact): DungeonArtifact {
  const terrain = dungeon.terrain;
  const width = dungeon.width;

  const validSpawns = dungeon.spawns.filter(spawn => {
    const index = spawn.position.y * width + spawn.position.x;
    return terrain[index] === CellType.FLOOR;
  });

  // Log warning if spawns were removed
  if (validSpawns.length !== dungeon.spawns.length) {
    console.warn(
      `[procgen] Removed ${dungeon.spawns.length - validSpawns.length} invalid spawns after post-processing`
    );
  }

  return {
    ...dungeon,
    spawns: validSpawns,
  };
}
```

---

## Phase 2: Améliorations de Qualité

### 2.1 Dijkstra Maps Utility

**Objectif:** Permettre le calcul de distances réelles (pas Manhattan) pour le spawn placement.

**Fichiers à créer:**
- `src/core/pathfinding/dijkstra-map.ts`
- `src/core/pathfinding/index.ts`

**Implémentation:**

```typescript
// src/core/pathfinding/dijkstra-map.ts

import { Grid, CellType } from "../grid";
import type { Point } from "../geometry/types";

/**
 * A Dijkstra map stores the minimum distance from any cell to the nearest goal.
 *
 * @see https://www.roguebasin.com/index.php/The_Incredible_Power_of_Dijkstra_Maps
 */
export class DijkstraMap {
  private readonly distances: Float32Array;
  private readonly width: number;
  private readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.distances = new Float32Array(width * height).fill(Infinity);
  }

  /**
   * Get distance at a position
   */
  get(x: number, y: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return Infinity;
    }
    return this.distances[y * this.width + x]!;
  }

  /**
   * Set distance at a position
   */
  set(x: number, y: number, value: number): void {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      this.distances[y * this.width + x] = value;
    }
  }

  /**
   * Get the raw distance array
   */
  getRawData(): Float32Array {
    return this.distances;
  }

  /**
   * Find the maximum distance (furthest point from goals)
   */
  getMaxDistance(): { point: Point; distance: number } | null {
    let max = -Infinity;
    let maxPoint: Point | null = null;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const dist = this.get(x, y);
        if (dist !== Infinity && dist > max) {
          max = dist;
          maxPoint = { x, y };
        }
      }
    }

    return maxPoint ? { point: maxPoint, distance: max } : null;
  }

  /**
   * Get all points within a distance range
   */
  getPointsInRange(minDist: number, maxDist: number): Point[] {
    const points: Point[] = [];

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const dist = this.get(x, y);
        if (dist >= minDist && dist <= maxDist) {
          points.push({ x, y });
        }
      }
    }

    return points;
  }
}

/**
 * Compute a Dijkstra map from goal points
 */
export function computeDijkstraMap(
  grid: Grid,
  goals: readonly Point[],
  options: {
    walkable?: CellType[];
    maxDistance?: number;
  } = {}
): DijkstraMap {
  const walkable = options.walkable ?? [CellType.FLOOR];
  const maxDistance = options.maxDistance ?? Infinity;
  const walkableSet = new Set(walkable);

  const map = new DijkstraMap(grid.width, grid.height);

  // Initialize goals with distance 0
  const queue: Array<{ x: number; y: number; dist: number }> = [];
  for (const goal of goals) {
    map.set(goal.x, goal.y, 0);
    queue.push({ x: goal.x, y: goal.y, dist: 0 });
  }

  // BFS to compute distances
  const directions = [
    [0, 1], [1, 0], [0, -1], [-1, 0], // Cardinal
    [1, 1], [1, -1], [-1, 1], [-1, -1], // Diagonal
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.dist >= maxDistance) continue;

    for (const [dx, dy] of directions) {
      const nx = current.x + dx!;
      const ny = current.y + dy!;

      if (!grid.isInBounds(nx, ny)) continue;
      if (!walkableSet.has(grid.get(nx, ny))) continue;

      // Diagonal movement costs sqrt(2), cardinal costs 1
      const moveCost = (dx !== 0 && dy !== 0) ? 1.414 : 1;
      const newDist = current.dist + moveCost;

      if (newDist < map.get(nx, ny)) {
        map.set(nx, ny, newDist);
        queue.push({ x: nx, y: ny, dist: newDist });
      }
    }
  }

  return map;
}

/**
 * Create a "flee" map (inverted Dijkstra map for monster fleeing behavior)
 */
export function computeFleeMap(
  dijkstraMap: DijkstraMap,
  multiplier: number = -1.2
): DijkstraMap {
  const fleeMap = new DijkstraMap(dijkstraMap["width"], dijkstraMap["height"]);
  const raw = dijkstraMap.getRawData();
  const fleeRaw = fleeMap.getRawData();

  // Multiply all values by negative factor
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== Infinity) {
      fleeRaw[i] = raw[i]! * multiplier;
    }
  }

  // Re-scan to smooth the flee map
  // This makes monsters flee towards exits rather than corners
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 0; y < dijkstraMap["height"]; y++) {
      for (let x = 0; x < dijkstraMap["width"]; x++) {
        const current = fleeMap.get(x, y);
        if (current === Infinity) continue;

        // Check neighbors
        let lowestNeighbor = current;
        for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
          const nx = x + dx!;
          const ny = y + dy!;
          const neighborVal = fleeMap.get(nx, ny);
          if (neighborVal < lowestNeighbor) {
            lowestNeighbor = neighborVal;
          }
        }

        if (current - lowestNeighbor > 1) {
          fleeMap.set(x, y, lowestNeighbor + 1);
          changed = true;
        }
      }
    }
  }

  return fleeMap;
}
```

**Intégration dans les passes:**

```typescript
// src/generators/bsp/passes.ts - Modifier calculateSpawns

import { computeDijkstraMap } from "../../core/pathfinding/dijkstra-map";

export function calculateSpawns(): Pass<DungeonStateArtifact, DungeonStateArtifact> {
  return {
    id: "bsp.calculate-spawns",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    run(input, ctx) {
      // Find entrance
      const entranceRoom = input.rooms.find(r => r.type === "entrance");
      if (!entranceRoom) return input;

      // Compute Dijkstra map from entrance
      const entrancePoint = { x: entranceRoom.centerX, y: entranceRoom.centerY };
      const distanceMap = computeDijkstraMap(input.grid, [entrancePoint]);

      // Use real path distances for spawn placement
      const spawns: SpawnPoint[] = [];

      for (const room of input.rooms) {
        const realDistance = distanceMap.get(room.centerX, room.centerY);

        spawns.push({
          position: { x: room.centerX, y: room.centerY },
          roomId: room.id,
          type: room.type === "entrance" ? "entrance" :
                room.type === "exit" ? "exit" : "spawn",
          tags: [room.type],
          weight: 1,
          distanceFromStart: realDistance, // Real distance, not Manhattan!
        });
      }

      return { ...input, spawns };
    },
  };
}
```

---

### 2.2 Property-Based Testing

**Objectif:** Tester les invariants sur des milliers de seeds.

**Fichiers à créer:**
- `tests/property/invariants.property.test.ts`
- `tests/property/determinism.property.test.ts`
- `tests/property/performance.property.test.ts`

**Implémentation:**

```typescript
// tests/property/invariants.property.test.ts

import { describe, it, expect } from "bun:test";
import { generate, createSeed, validateDungeon } from "../../src";
import type { GenerationConfig } from "../../src";

const SEED_COUNT = 1000;
const ALGORITHMS = ["bsp", "cellular"] as const;
const SIZES = [
  { width: 40, height: 30 },
  { width: 80, height: 60 },
  { width: 120, height: 90 },
  { width: 200, height: 150 },
] as const;

describe("property: invariants hold over many seeds", () => {
  for (const algorithm of ALGORITHMS) {
    for (const size of SIZES) {
      it(`${algorithm} ${size.width}x${size.height}: all dungeons are valid`, () => {
        const failures: Array<{ seed: number; violations: string[] }> = [];

        for (let i = 0; i < SEED_COUNT; i++) {
          const config: GenerationConfig = {
            ...size,
            seed: createSeed(i),
            algorithm,
          };

          const result = generate(config);

          if (!result.success) {
            failures.push({ seed: i, violations: [result.error.message] });
            continue;
          }

          const validation = validateDungeon(result.artifact);
          if (!validation.valid) {
            failures.push({
              seed: i,
              violations: validation.violations.map(v => v.message),
            });
          }
        }

        if (failures.length > 0) {
          console.error(`Failed seeds:`, failures.slice(0, 10));
        }

        expect(failures.length).toBe(0);
      });
    }
  }
});

describe("property: room counts are reasonable", () => {
  it("BSP produces rooms within expected range", () => {
    const roomCounts: number[] = [];

    for (let i = 0; i < SEED_COUNT; i++) {
      const result = generate({
        width: 80,
        height: 60,
        seed: createSeed(i),
        algorithm: "bsp",
      });

      if (result.success) {
        roomCounts.push(result.artifact.rooms.length);
      }
    }

    const avg = roomCounts.reduce((a, b) => a + b, 0) / roomCounts.length;
    const min = Math.min(...roomCounts);
    const max = Math.max(...roomCounts);

    console.log(`Room count stats: min=${min}, max=${max}, avg=${avg.toFixed(1)}`);

    // BSP should produce at least 3 rooms for 80x60
    expect(min).toBeGreaterThanOrEqual(3);
    // And not more than ~30 for this size
    expect(max).toBeLessThanOrEqual(30);
  });
});

describe("property: entrance and exit are always reachable", () => {
  it("entrance can reach exit in all dungeons", () => {
    const unreachable: number[] = [];

    for (let i = 0; i < SEED_COUNT; i++) {
      const result = generate({
        width: 80,
        height: 60,
        seed: createSeed(i),
        algorithm: "bsp",
      });

      if (!result.success) continue;

      const entrance = result.artifact.spawns.find(s => s.type === "entrance");
      const exit = result.artifact.spawns.find(s => s.type === "exit");

      if (!entrance || !exit) {
        unreachable.push(i);
        continue;
      }

      // Verify path exists using flood fill
      const validation = validateDungeon(result.artifact);
      const connectivityViolation = validation.violations.find(
        v => v.type === "invariant.connectivity"
      );

      if (connectivityViolation) {
        unreachable.push(i);
      }
    }

    expect(unreachable.length).toBe(0);
  });
});
```

```typescript
// tests/property/determinism.property.test.ts

describe("property: determinism is absolute", () => {
  it("same seed always produces same checksum", () => {
    const mismatches: Array<{ seed: number; checksum1: string; checksum2: string }> = [];

    for (let i = 0; i < SEED_COUNT; i++) {
      const config: GenerationConfig = {
        width: 80,
        height: 60,
        seed: createSeed(i),
        algorithm: "bsp",
      };

      const result1 = generate(config);
      const result2 = generate(config);

      if (result1.success && result2.success) {
        if (result1.artifact.checksum !== result2.artifact.checksum) {
          mismatches.push({
            seed: i,
            checksum1: result1.artifact.checksum,
            checksum2: result2.artifact.checksum,
          });
        }
      }
    }

    expect(mismatches.length).toBe(0);
  });

  it("different seeds produce different checksums (no collisions in sample)", () => {
    const checksums = new Map<string, number[]>();

    for (let i = 0; i < SEED_COUNT; i++) {
      const result = generate({
        width: 80,
        height: 60,
        seed: createSeed(i),
        algorithm: "bsp",
      });

      if (result.success) {
        const existing = checksums.get(result.artifact.checksum) ?? [];
        existing.push(i);
        checksums.set(result.artifact.checksum, existing);
      }
    }

    // Find collisions
    const collisions = Array.from(checksums.entries())
      .filter(([_, seeds]) => seeds.length > 1);

    if (collisions.length > 0) {
      console.warn(`Checksum collisions found:`, collisions);
    }

    // With FNV64, we shouldn't see collisions in 1000 samples
    expect(collisions.length).toBe(0);
  });
});
```

---

### 2.3 Delaunay Edge Case Handling

**Fichier à modifier:** `src/core/geometry/delaunay.ts`

**Implémentation:**

```typescript
// Ajouter au début du fichier

/**
 * Validate and preprocess points for Delaunay triangulation
 */
function preprocessPoints(
  points: readonly { x: number; y: number }[]
): { x: number; y: number }[] {
  if (points.length < 3) {
    return [...points];
  }

  // Remove duplicate points
  const seen = new Set<string>();
  const unique: { x: number; y: number }[] = [];

  for (const p of points) {
    const key = `${p.x},${p.y}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(p);
    }
  }

  // Check for collinearity
  if (areAllCollinear(unique)) {
    // Add small jitter to break collinearity
    return unique.map((p, i) => ({
      x: p.x + (i % 2 === 0 ? 0.001 : -0.001),
      y: p.y + (i % 3 === 0 ? 0.001 : -0.001),
    }));
  }

  return unique;
}

function areAllCollinear(points: readonly { x: number; y: number }[]): boolean {
  if (points.length < 3) return true;

  const [p0, p1] = points;
  if (!p0 || !p1) return true;

  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;

  for (let i = 2; i < points.length; i++) {
    const p = points[i]!;
    const cross = (p.x - p0.x) * dy - (p.y - p0.y) * dx;
    if (Math.abs(cross) > 0.001) {
      return false;
    }
  }

  return true;
}

// Modifier triangulate() pour utiliser preprocessPoints
export function triangulate(
  points: readonly { x: number; y: number }[]
): DelaunayTriangulation {
  const processed = preprocessPoints(points);

  if (processed.length < 3) {
    // Fall back to complete graph for tiny point sets
    return createFallbackTriangulation(processed);
  }

  // ... existing triangulation code ...
}

function createFallbackTriangulation(
  points: readonly { x: number; y: number }[]
): DelaunayTriangulation {
  // Return edges connecting all points (complete graph)
  const edges: Array<[number, number]> = [];

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      edges.push([i, j]);
    }
  }

  return {
    points: [...points],
    triangles: [],
    edges,
  };
}
```

---

### 2.4 Path Compression for Connections

**Objectif:** Réduire l'empreinte mémoire des corridors longs.

**Fichiers à modifier:**
- `src/pipeline/types.ts`
- `src/generators/bsp/passes.ts`

**Implémentation:**

```typescript
// src/core/compression/path-rle.ts (nouveau fichier)

import type { Point } from "../geometry/types";

type Direction = "N" | "S" | "E" | "W" | "NE" | "NW" | "SE" | "SW";

interface PathRLE {
  start: Point;
  moves: Array<{ dir: Direction; count: number }>;
}

const DIR_VECTORS: Record<Direction, [number, number]> = {
  N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0],
  NE: [1, -1], NW: [-1, -1], SE: [1, 1], SW: [-1, 1],
};

/**
 * Compress a path using run-length encoding of directions
 */
export function compressPath(points: readonly Point[]): PathRLE {
  if (points.length === 0) {
    return { start: { x: 0, y: 0 }, moves: [] };
  }

  const start = points[0]!;
  const moves: Array<{ dir: Direction; count: number }> = [];

  let currentDir: Direction | null = null;
  let count = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;

    const dir = getDirection(dx, dy);

    if (dir === currentDir) {
      count++;
    } else {
      if (currentDir !== null) {
        moves.push({ dir: currentDir, count });
      }
      currentDir = dir;
      count = 1;
    }
  }

  if (currentDir !== null) {
    moves.push({ dir: currentDir, count });
  }

  return { start, moves };
}

/**
 * Decompress a path from RLE format
 */
export function decompressPath(rle: PathRLE): Point[] {
  const points: Point[] = [rle.start];
  let { x, y } = rle.start;

  for (const move of rle.moves) {
    const [dx, dy] = DIR_VECTORS[move.dir];
    for (let i = 0; i < move.count; i++) {
      x += dx!;
      y += dy!;
      points.push({ x, y });
    }
  }

  return points;
}

function getDirection(dx: number, dy: number): Direction {
  if (dx === 0 && dy < 0) return "N";
  if (dx === 0 && dy > 0) return "S";
  if (dx > 0 && dy === 0) return "E";
  if (dx < 0 && dy === 0) return "W";
  if (dx > 0 && dy < 0) return "NE";
  if (dx < 0 && dy < 0) return "NW";
  if (dx > 0 && dy > 0) return "SE";
  return "SW";
}

/**
 * Calculate compression ratio
 */
export function getCompressionRatio(original: readonly Point[], compressed: PathRLE): number {
  const originalSize = original.length * 8; // 2 ints per point
  const compressedSize = 8 + compressed.moves.length * 2; // start + moves
  return originalSize / compressedSize;
}
```

---

## Phase 3: Nouvelles Fonctionnalités

### 3.1 Lock-and-Key Pattern Support

**Objectif:** Permettre la génération de donjons avec progression gated.

**Fichiers à créer:**
- `src/passes/progression/lock-and-key.ts`
- `src/passes/progression/types.ts`

**Implémentation:**

```typescript
// src/passes/progression/types.ts

export interface Lock {
  readonly type: string; // "red_key", "boss_defeated", "puzzle_solved"
  readonly connectionId: number;
}

export interface Key {
  readonly type: string;
  readonly roomId: number;
  readonly spawnPoint: Point;
}

export interface ProgressionGraph {
  readonly locks: readonly Lock[];
  readonly keys: readonly Key[];
  readonly solvable: boolean;
  readonly criticalPath: readonly number[]; // Room IDs in order
}
```

```typescript
// src/passes/progression/lock-and-key.ts

import type { Pass, DungeonStateArtifact } from "../../pipeline/types";
import type { ProgressionGraph, Lock, Key } from "./types";

interface LockAndKeyConfig {
  keyTypes: string[];
  lockProbability: number; // 0-1, how likely a connection is locked
  minDistanceFromStart: number; // Keys must be this far from entrance
}

const DEFAULT_CONFIG: LockAndKeyConfig = {
  keyTypes: ["red_key", "blue_key", "gold_key"],
  lockProbability: 0.3,
  minDistanceFromStart: 2,
};

/**
 * Generate lock-and-key progression for a dungeon
 */
export function generateProgression(): Pass<DungeonStateArtifact, DungeonStateArtifact & { progression: ProgressionGraph }> {
  return {
    id: "progression.lock-and-key",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    run(input, ctx) {
      const config = { ...DEFAULT_CONFIG, ...ctx.config.progression };
      const rng = ctx.streams.details;

      // Build room graph
      const roomGraph = buildRoomGraph(input.rooms, input.connections);

      // Find entrance room
      const entranceRoom = input.rooms.find(r => r.type === "entrance");
      if (!entranceRoom) {
        return { ...input, progression: { locks: [], keys: [], solvable: true, criticalPath: [] } };
      }

      // Calculate distances from entrance using BFS
      const distances = bfsDistances(roomGraph, entranceRoom.id);

      // Select connections to lock (prefer connections far from entrance)
      const locks: Lock[] = [];
      const usedKeyTypes = new Set<string>();

      for (const conn of input.connections) {
        const distFrom = distances.get(conn.fromRoomId) ?? 0;
        const distTo = distances.get(conn.toRoomId) ?? 0;
        const minDist = Math.min(distFrom, distTo);

        // Don't lock connections near entrance
        if (minDist < config.minDistanceFromStart) continue;

        // Random chance to lock
        if (rng.next() > config.lockProbability) continue;

        // Select key type
        const availableTypes = config.keyTypes.filter(t => !usedKeyTypes.has(t));
        if (availableTypes.length === 0) break;

        const keyType = availableTypes[Math.floor(rng.next() * availableTypes.length)]!;
        usedKeyTypes.add(keyType);

        locks.push({
          type: keyType,
          connectionId: conn.fromRoomId * 1000 + conn.toRoomId, // Simple ID
        });
      }

      // Place keys in rooms reachable before their locks
      const keys: Key[] = [];
      for (const lock of locks) {
        const keyRoom = findKeyPlacement(input.rooms, roomGraph, distances, lock, locks, rng);
        if (keyRoom) {
          keys.push({
            type: lock.type,
            roomId: keyRoom.id,
            spawnPoint: { x: keyRoom.centerX, y: keyRoom.centerY },
          });
        }
      }

      // Verify solvability
      const solvable = verifySolvability(input.rooms, input.connections, locks, keys, entranceRoom.id);

      // Calculate critical path
      const exitRoom = input.rooms.find(r => r.type === "exit");
      const criticalPath = exitRoom
        ? calculateCriticalPath(roomGraph, entranceRoom.id, exitRoom.id, locks, keys)
        : [];

      ctx.trace.decision(
        "progression.lock-and-key",
        "Progression generated",
        [`${locks.length} locks`, `${keys.length} keys`],
        solvable ? "solvable" : "UNSOLVABLE",
        `Critical path: ${criticalPath.length} rooms`
      );

      return {
        ...input,
        progression: { locks, keys, solvable, criticalPath },
      };
    },
  };
}

function verifySolvability(
  rooms: readonly Room[],
  connections: readonly Connection[],
  locks: readonly Lock[],
  keys: readonly Key[],
  startRoomId: number
): boolean {
  // Simulate playing through the dungeon
  const collectedKeys = new Set<string>();
  const visited = new Set<number>();
  const queue = [startRoomId];

  while (queue.length > 0) {
    const currentRoom = queue.shift()!;
    if (visited.has(currentRoom)) continue;
    visited.add(currentRoom);

    // Collect any keys in this room
    for (const key of keys) {
      if (key.roomId === currentRoom) {
        collectedKeys.add(key.type);
      }
    }

    // Try to traverse connections
    for (const conn of connections) {
      let otherRoom: number | null = null;
      if (conn.fromRoomId === currentRoom) otherRoom = conn.toRoomId;
      if (conn.toRoomId === currentRoom) otherRoom = conn.fromRoomId;
      if (otherRoom === null) continue;

      // Check if connection is locked
      const lock = locks.find(l =>
        l.connectionId === conn.fromRoomId * 1000 + conn.toRoomId ||
        l.connectionId === conn.toRoomId * 1000 + conn.fromRoomId
      );

      if (lock && !collectedKeys.has(lock.type)) {
        continue; // Can't pass, don't have key
      }

      queue.push(otherRoom);
    }
  }

  // Check if we visited all rooms
  return visited.size === rooms.length;
}
```

---

### 3.2 Algorithm Fragment Extraction

**Objectif:** Exposer des fragments d'algorithmes réutilisables.

**Fichiers à créer:**
- `src/fragments/index.ts`
- `src/fragments/partitioning.ts`
- `src/fragments/connectivity.ts`
- `src/fragments/cellular.ts`

```typescript
// src/fragments/index.ts

export * from "./partitioning";
export * from "./connectivity";
export * from "./cellular";

/**
 * Algorithm fragments are standalone functions that can be composed
 * to create custom generation pipelines.
 *
 * @example
 * ```typescript
 * import { bspPartition, mstConnect, cellularSmooth } from "@rogue/procgen-v2/fragments";
 *
 * // Use BSP for room layout
 * const nodes = bspPartition(grid, { minSize: 10, splitRatio: 0.5 });
 *
 * // Place rooms in leaves
 * const rooms = placeRoomsInLeaves(nodes, grid);
 *
 * // Connect with MST
 * const edges = mstConnect(rooms);
 *
 * // Apply cellular smoothing to walls
 * cellularSmooth(grid, { iterations: 3 });
 * ```
 */
```

```typescript
// src/fragments/partitioning.ts

import { Grid } from "../core/grid";

export interface BSPNode {
  x: number;
  y: number;
  width: number;
  height: number;
  left: BSPNode | null;
  right: BSPNode | null;
}

export interface PartitionConfig {
  minSize: number;
  splitRatio: number;
  splitVariance: number;
}

/**
 * Partition a grid using BSP algorithm
 */
export function bspPartition(
  width: number,
  height: number,
  config: PartitionConfig,
  rng: () => number
): BSPNode {
  const root: BSPNode = {
    x: 0, y: 0, width, height,
    left: null, right: null,
  };

  const queue: BSPNode[] = [root];

  while (queue.length > 0) {
    const node = queue.shift()!;

    if (node.width < config.minSize * 2 && node.height < config.minSize * 2) {
      continue; // Too small to split
    }

    // Decide split direction
    const splitHorizontal = node.width > node.height * 1.25
      ? false
      : node.height > node.width * 1.25
        ? true
        : rng() < 0.5;

    // Calculate split position with variance
    const baseRatio = config.splitRatio;
    const variance = (rng() - 0.5) * 2 * config.splitVariance;
    const ratio = Math.max(0.3, Math.min(0.7, baseRatio + variance));

    if (splitHorizontal) {
      const splitY = Math.floor(node.y + node.height * ratio);
      node.left = { x: node.x, y: node.y, width: node.width, height: splitY - node.y, left: null, right: null };
      node.right = { x: node.x, y: splitY, width: node.width, height: node.y + node.height - splitY, left: null, right: null };
    } else {
      const splitX = Math.floor(node.x + node.width * ratio);
      node.left = { x: node.x, y: node.y, width: splitX - node.x, height: node.height, left: null, right: null };
      node.right = { x: splitX, y: node.y, width: node.x + node.width - splitX, height: node.height, left: null, right: null };
    }

    queue.push(node.left, node.right);
  }

  return root;
}

/**
 * Get all leaf nodes from a BSP tree
 */
export function getBSPLeaves(root: BSPNode): BSPNode[] {
  const leaves: BSPNode[] = [];
  const stack: BSPNode[] = [root];

  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.left === null && node.right === null) {
      leaves.push(node);
    } else {
      if (node.left) stack.push(node.left);
      if (node.right) stack.push(node.right);
    }
  }

  return leaves;
}
```

```typescript
// src/fragments/cellular.ts

import { Grid, CellType } from "../core/grid";

export interface CellularConfig {
  birthLimit: number;
  deathLimit: number;
}

/**
 * Apply cellular automata smoothing to a grid
 */
export function cellularSmooth(
  grid: Grid,
  iterations: number,
  config: CellularConfig = { birthLimit: 4, deathLimit: 3 }
): void {
  const buffer = new Grid(grid.width, grid.height, CellType.WALL);

  for (let i = 0; i < iterations; i++) {
    grid.applyCellularAutomataInto(config.birthLimit, config.deathLimit, buffer);

    // Swap
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        grid.set(x, y, buffer.get(x, y));
      }
    }
  }
}

/**
 * Add noise to existing walls (texture pass)
 */
export function addWallNoise(
  grid: Grid,
  noiseRatio: number,
  rng: () => number
): void {
  for (let y = 1; y < grid.height - 1; y++) {
    for (let x = 1; x < grid.width - 1; x++) {
      if (grid.get(x, y) !== CellType.WALL) continue;

      // Count floor neighbors
      let floorNeighbors = 0;
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        if (grid.get(x + dx!, y + dy!) === CellType.FLOOR) {
          floorNeighbors++;
        }
      }

      // Walls adjacent to floors have a chance to become floor (rougher edges)
      if (floorNeighbors > 0 && rng() < noiseRatio * floorNeighbors) {
        grid.set(x, y, CellType.FLOOR);
      }
    }
  }
}
```

---

### 3.3 Rule Engine Integration

**Objectif:** Utiliser le rule engine pour le content placement data-driven.

**Fichiers à créer:**
- `src/passes/content/rule-based-spawner.ts`
- `src/passes/content/schemas/spawn-rules.ts`

```typescript
// src/passes/content/rule-based-spawner.ts

import { createRuleEngine } from "../../core/rules/engine";
import { field, literal, gt, lt, and, or } from "../../core/rules/expression";
import type { Pass, DungeonStateArtifact, SpawnPoint } from "../../pipeline/types";
import { createObjectResolver } from "../../core/rules/evaluator";

interface SpawnAction {
  type: "spawn";
  template: string;
  count: number;
  tags: string[];
}

/**
 * Rule-based spawn pass
 *
 * Evaluates rules against each room to determine spawn content.
 */
export function ruleBasedSpawner(
  rules: string // JSON rules
): Pass<DungeonStateArtifact, DungeonStateArtifact> {
  return {
    id: "content.rule-spawner",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    run(input, ctx) {
      const engine = createRuleEngine<SpawnAction>();

      // Load rules from JSON
      const parsedRules = JSON.parse(rules);
      for (const rule of parsedRules) {
        engine.addRule(rule);
      }

      const newSpawns: SpawnPoint[] = [];
      const rng = ctx.streams.details;

      for (const room of input.rooms) {
        // Build context for this room
        const context = {
          room: {
            type: room.type,
            width: room.width,
            height: room.height,
            area: room.width * room.height,
            distanceFromStart: calculateRoomDistance(room, input),
            normalizedDistance: calculateNormalizedDistance(room, input),
          },
          dungeon: {
            depth: ctx.config.depth ?? 1,
            difficulty: ctx.config.difficulty ?? 0.5,
            roomCount: input.rooms.length,
          },
        };

        const resolver = createObjectResolver(context);
        const result = engine.evaluate(resolver, () => rng.next());

        // Process matched rules
        for (const match of result.matched) {
          if (match.action?.type === "spawn") {
            for (let i = 0; i < match.action.count; i++) {
              // Random position within room
              const x = room.x + Math.floor(rng.next() * room.width);
              const y = room.y + Math.floor(rng.next() * room.height);

              newSpawns.push({
                position: { x, y },
                roomId: room.id,
                type: match.action.template,
                tags: match.action.tags,
                weight: 1,
                distanceFromStart: context.room.distanceFromStart,
              });
            }
          }
        }
      }

      ctx.trace.decision(
        "content.rule-spawner",
        "Rule-based spawning",
        [`${newSpawns.length} spawns from ${engine.getRules().length} rules`],
        "complete",
        `Generated ${newSpawns.length} spawn points`
      );

      return {
        ...input,
        spawns: [...input.spawns, ...newSpawns],
      };
    },
  };
}
```

**Exemple de règles JSON:**

```json
[
  {
    "id": "treasure-in-dead-ends",
    "priority": 100,
    "condition": {
      "type": "op",
      "operator": "and",
      "left": { "type": "op", "operator": "eq", "left": { "type": "field", "path": "room.type" }, "right": { "type": "literal", "value": "treasure" } },
      "right": { "type": "op", "operator": "gt", "left": { "type": "field", "path": "room.normalizedDistance" }, "right": { "type": "literal", "value": 0.5 } }
    },
    "action": {
      "type": "spawn",
      "template": "treasure_chest",
      "count": 1,
      "tags": ["loot", "treasure"]
    }
  },
  {
    "id": "enemies-scale-with-distance",
    "priority": 80,
    "condition": {
      "type": "op",
      "operator": "gt",
      "left": { "type": "field", "path": "room.normalizedDistance" },
      "right": { "type": "literal", "value": 0.3 }
    },
    "action": {
      "type": "spawn",
      "template": "enemy_basic",
      "count": { "type": "fn", "name": "floor", "args": [{ "type": "op", "operator": "*", "left": { "type": "field", "path": "room.normalizedDistance" }, "right": { "type": "literal", "value": 4 } }] },
      "tags": ["enemy"]
    }
  }
]
```

---

## Phase 4: Niveau Masterpiece

### 4.1 Generation Metrics Dashboard

```typescript
// src/metrics/collector.ts

export interface GenerationMetrics {
  // Timing
  totalDurationMs: number;
  passDurations: Map<string, number>;

  // Spatial
  roomCount: number;
  roomSizeDistribution: { min: number; max: number; avg: number; stdDev: number };
  corridorLengthDistribution: { min: number; max: number; avg: number; total: number };
  floorRatio: number;

  // Connectivity
  graphDensity: number; // edges / (n*(n-1)/2)
  averagePathLength: number;
  longestShortestPath: number; // Diameter

  // Quality
  deadEndCount: number;
  unreachableAreaRatio: number;

  // Content
  spawnsByType: Map<string, number>;
  roomsByType: Map<string, number>;
}

export function collectMetrics(artifact: DungeonArtifact, trace?: TraceEvent[]): GenerationMetrics {
  // ... implementation
}
```

### 4.2 Enhanced Decision Provenance

```typescript
// src/trace/provenance.ts

export interface DecisionProvenance {
  question: string;
  context: Record<string, unknown>;
  options: Array<{
    choice: string;
    reason: string;
    score?: number;
  }>;
  chosen: string;
  because: string;
  timestamp: number;
  passId: string;
}

export function createProvenanceCollector(): {
  record: (provenance: DecisionProvenance) => void;
  getAll: () => DecisionProvenance[];
  toMarkdown: () => string;
  toJSON: () => string;
} {
  // ... implementation
}
```

---

## Dépendances et Ordre d'Exécution

```
Phase 1 (Pré-requis pour tout)
├── 1.1 Room Center Walkability
├── 1.2 Corridor Crossing Detection
└── 1.3 Spawn Re-validation

Phase 2 (Indépendants, peuvent être parallélisés)
├── 2.1 Dijkstra Maps ──────────┐
├── 2.2 Property Testing        │
├── 2.3 Delaunay Edge Cases     │
└── 2.4 Path Compression        │
                                │
Phase 3 (Dépendances)           │
├── 3.1 Lock-and-Key ───────────┤ (dépend de Dijkstra Maps)
├── 3.2 Algorithm Fragments     │
├── 3.3 Rule Engine Integration │
└── 3.4 Hybrid Composition ─────┤ (dépend de Algorithm Fragments)
                                │
Phase 4 (Final polish)          │
├── 4.1 Metrics Dashboard ──────┘
├── 4.2 Decision Provenance
├── 4.3 Visual Debugging
├── 4.4 Parameter Sweeping
└── 4.5 Cross-platform Tests
```

---

## Tests Requis

### Pour chaque amélioration, ajouter:

1. **Tests unitaires** - Tester la fonction/pass isolément
2. **Tests d'intégration** - Vérifier que ça s'intègre dans le pipeline existant
3. **Tests de régression** - S'assurer que les checksums existants ne changent pas
4. **Tests de performance** - Benchmarks pour éviter les régressions de perf

### Checklist de test:

```typescript
// Template de test pour chaque amélioration
describe("feature-name", () => {
  // Unit tests
  describe("unit", () => {
    it("handles normal case", () => {});
    it("handles edge case: empty input", () => {});
    it("handles edge case: large input", () => {});
  });

  // Integration tests
  describe("integration", () => {
    it("works in BSP pipeline", () => {});
    it("works in Cellular pipeline", () => {});
    it("works with generator chaining", () => {});
  });

  // Regression tests
  describe("regression", () => {
    it("produces same checksum as before", () => {
      // Compare against known good checksum
    });
  });

  // Performance tests
  describe("performance", () => {
    it("completes within time budget", () => {
      const start = performance.now();
      // ... run feature ...
      expect(performance.now() - start).toBeLessThan(100);
    });
  });
});
```

---

## Notes de Reprise

### Pour reprendre ce travail:

1. **Lire ce document** en entier pour comprendre le contexte
2. **Vérifier le statut actuel** en listant les tests qui passent/échouent
3. **Commencer par Phase 1** - les corrections critiques
4. **Un item à la fois** - compléter, tester, commiter avant le suivant
5. **Mettre à jour ce document** après chaque implémentation

### Commandes utiles:

```bash
# Lancer tous les tests
cd packages/procgen-v2 && bun test

# Lancer un test spécifique
bun test tests/generation.test.ts

# Benchmark
bun test tests/property/performance.property.test.ts

# Type check
bun run typecheck
```

### Contact & Ressources:

- [RogueBasin - Dijkstra Maps](https://www.roguebasin.com/index.php/The_Incredible_Power_of_Dijkstra_Maps)
- [PCG Wiki - Dungeon Generation](http://pcg.wikidot.com/pcg-algorithm:dungeon-generation)
- [Wave Function Collapse](https://github.com/mxgmn/WaveFunctionCollapse)

---

> Document généré le 2025-01-11 par Claude Code (counter-analysis ultrawork)
