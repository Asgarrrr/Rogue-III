/**
 * Lock-and-Key Pattern Generator
 *
 * Generates progression structures for dungeons with gated areas.
 * Ensures that keys are always reachable before their corresponding locks.
 *
 * @see https://www.boristhebrave.com/2020/09/12/dungeon-generation-in-binding-of-isaac/
 */

import type { Point } from "../../core/geometry/types";
import type { Connection, Room } from "../../pipeline/types";
import type { Key, Lock, LockAndKeyConfig, ProgressionGraph } from "./types";
import { DEFAULT_LOCK_AND_KEY_CONFIG } from "./types";

/**
 * Simple seeded RNG interface
 */
interface RNG {
  next(): number;
}

/**
 * Build room adjacency graph from connections
 */
function buildRoomGraph(
  rooms: readonly Room[],
  connections: readonly Connection[],
): Map<number, Set<number>> {
  const graph = new Map<number, Set<number>>();

  // Initialize all rooms
  for (const room of rooms) {
    graph.set(room.id, new Set());
  }

  // Add edges from connections
  for (const conn of connections) {
    graph.get(conn.fromRoomId)?.add(conn.toRoomId);
    graph.get(conn.toRoomId)?.add(conn.fromRoomId);
  }

  return graph;
}

/**
 * Calculate BFS distances from a starting room
 */
function bfsDistances(
  graph: Map<number, Set<number>>,
  startRoomId: number,
): Map<number, number> {
  const distances = new Map<number, number>();
  const queue: Array<{ roomId: number; dist: number }> = [
    { roomId: startRoomId, dist: 0 },
  ];
  let queueHead = 0;
  distances.set(startRoomId, 0);

  // Guard against infinite loops (max iterations = 10x room count)
  const maxIterations = graph.size * 10;
  let iterations = 0;

  while (queueHead < queue.length && iterations++ < maxIterations) {
    const current = queue[queueHead++];
    if (!current) break;

    for (const neighbor of graph.get(current.roomId) ?? []) {
      if (!distances.has(neighbor)) {
        distances.set(neighbor, current.dist + 1);
        queue.push({ roomId: neighbor, dist: current.dist + 1 });
      }
    }
  }

  return distances;
}

/**
 * Find reachable rooms without passing through locked connections
 */
function findReachableRooms(
  startRoomId: number,
  connections: readonly Connection[],
  lockedConnectionIndices: ReadonlySet<number>,
  unlockedTypes: ReadonlySet<string>,
  locks: readonly Lock[],
): Set<number> {
  const visited = new Set<number>();
  const queue = [startRoomId];
  let queueHead = 0;
  visited.add(startRoomId);

  // Guard against infinite loops
  const maxIterations = connections.length * 10;
  let iterations = 0;

  while (queueHead < queue.length && iterations++ < maxIterations) {
    const currentRoom = queue[queueHead++];
    if (currentRoom === undefined) break;

    for (let i = 0; i < connections.length; i++) {
      const conn = connections[i];
      if (!conn) continue;

      // Determine the other room
      let otherRoom: number | null = null;
      if (conn.fromRoomId === currentRoom) otherRoom = conn.toRoomId;
      else if (conn.toRoomId === currentRoom) otherRoom = conn.fromRoomId;
      else continue;

      if (visited.has(otherRoom)) continue;

      // Check if this connection is locked
      if (lockedConnectionIndices.has(i)) {
        const lock = locks.find((l) => l.connectionIndex === i);
        if (lock && !unlockedTypes.has(lock.type)) {
          continue; // Locked and we don't have the key
        }
      }

      visited.add(otherRoom);
      queue.push(otherRoom);
    }
  }

  return visited;
}

/**
 * Find a suitable room to place a key
 *
 * The key must be placed in a room that is reachable BEFORE the lock.
 * This means we need to find rooms reachable without passing through:
 * 1. The new lock we're adding
 * 2. Any existing locks we don't have keys for yet
 */
function findKeyPlacement(
  rooms: readonly Room[],
  connections: readonly Connection[],
  distances: Map<number, number>,
  lock: Lock,
  existingLocks: readonly Lock[],
  existingKeys: readonly Key[],
  rng: RNG,
): Room | null {
  // Find rooms reachable without this lock (and without locks we don't have keys for yet)
  const unlockedTypes = new Set(existingKeys.map((k) => k.type));

  // Include BOTH existing locks AND the new lock we're placing
  const lockedIndices = new Set(existingLocks.map((l) => l.connectionIndex));
  lockedIndices.add(lock.connectionIndex); // Add the new lock too!

  // Get the locked connection
  const lockedConn = connections[lock.connectionIndex];
  if (!lockedConn) return null;

  // Start from entrance (room with distance 0)
  const entranceEntry = Array.from(distances.entries()).find(
    ([_, dist]) => dist === 0,
  );
  const entranceRoomId = entranceEntry?.[0];

  if (entranceRoomId === undefined) return null;

  // Find rooms reachable without passing through any locked connection
  // (including the new lock we're adding)
  const reachable = findReachableRooms(
    entranceRoomId,
    connections,
    lockedIndices,
    unlockedTypes,
    [...existingLocks, lock], // Include the new lock in the lock list
  );

  // Get candidate rooms (reachable, not the rooms on either side of the lock)
  const candidates = rooms.filter(
    (r) =>
      reachable.has(r.id) &&
      r.id !== lockedConn.fromRoomId &&
      r.id !== lockedConn.toRoomId &&
      r.type !== "entrance", // Don't place keys in entrance room
  );

  if (candidates.length === 0) {
    // Fallback: allow rooms adjacent to lock (but only on the entrance side)
    const entranceSideRoomId =
      (distances.get(lockedConn.fromRoomId) ?? 999) <
      (distances.get(lockedConn.toRoomId) ?? 999)
        ? lockedConn.fromRoomId
        : lockedConn.toRoomId;

    const fallbackCandidates = rooms.filter(
      (r) =>
        (reachable.has(r.id) || r.id === entranceSideRoomId) &&
        r.type !== "entrance",
    );
    if (fallbackCandidates.length === 0) return null;
    const selectedRoom =
      fallbackCandidates[Math.floor(rng.next() * fallbackCandidates.length)];
    return selectedRoom ?? null;
  }

  // Prefer rooms closer to the lock (but still before it)
  candidates.sort((a, b) => {
    const distA = distances.get(a.id) ?? 999;
    const distB = distances.get(b.id) ?? 999;
    return distB - distA; // Higher distance first (closer to lock)
  });

  // Take from top candidates with some randomness
  const topN = Math.min(3, candidates.length);
  const idx = Math.floor(rng.next() * topN);
  return candidates[idx] ?? null;
}

/**
 * Verify that the dungeon is solvable (exit reachable from entrance)
 */
function verifySolvability(
  rooms: readonly Room[],
  connections: readonly Connection[],
  locks: readonly Lock[],
  keys: readonly Key[],
  startRoomId: number,
): boolean {
  // Simulate playing through the dungeon with breadth-first exploration
  // Keep expanding until no new rooms can be reached
  const collectedKeys = new Set<string>();
  const visited = new Set<number>();

  // Guard against infinite outer loop (max = rooms + keys iterations)
  const maxOuterIterations = rooms.length + keys.length + 1;
  let outerIterations = 0;

  let changed = true;
  while (changed && outerIterations++ < maxOuterIterations) {
    changed = false;
    const toExplore = [startRoomId];
    let exploreHead = 0;
    const explored = new Set<number>();

    // Guard against infinite inner loop (ensure minimum of rooms.length iterations)
    const maxInnerIterations = Math.max(
      rooms.length,
      rooms.length * connections.length,
    );
    let innerIterations = 0;

    while (
      exploreHead < toExplore.length &&
      innerIterations++ < maxInnerIterations
    ) {
      const currentRoom = toExplore[exploreHead++];
      if (currentRoom === undefined) break;

      if (explored.has(currentRoom)) continue;
      explored.add(currentRoom);

      // Mark as visited
      if (!visited.has(currentRoom)) {
        visited.add(currentRoom);
        changed = true;
      }

      // Collect any keys in this room
      for (const key of keys) {
        if (key.roomId === currentRoom && !collectedKeys.has(key.type)) {
          collectedKeys.add(key.type);
          changed = true;
        }
      }

      // Try to traverse connections
      for (let i = 0; i < connections.length; i++) {
        const conn = connections[i];
        if (!conn) continue;

        let otherRoom: number | null = null;
        if (conn.fromRoomId === currentRoom) otherRoom = conn.toRoomId;
        else if (conn.toRoomId === currentRoom) otherRoom = conn.fromRoomId;
        else continue;

        // Check if connection is locked
        const lock = locks.find((l) => l.connectionIndex === i);
        if (lock && !collectedKeys.has(lock.type)) {
          continue; // Can't pass, don't have key
        }

        if (!explored.has(otherRoom)) {
          toExplore.push(otherRoom);
        }
      }
    }
  }

  // Check if we visited all rooms
  return visited.size === rooms.length;
}

/**
 * Calculate the critical path (shortest path requiring all keys)
 */
function calculateCriticalPath(
  _rooms: readonly Room[],
  connections: readonly Connection[],
  startRoomId: number,
  endRoomId: number,
  locks: readonly Lock[],
  keys: readonly Key[],
): number[] {
  // BFS to find shortest path respecting lock order
  interface State {
    roomId: number;
    keys: Set<string>;
    path: number[];
  }

  const queue: State[] = [
    { roomId: startRoomId, keys: new Set(), path: [startRoomId] },
  ];
  let queueHead = 0;
  const visited = new Map<string, number>(); // "roomId:keySet" -> path length

  // Guard against infinite loops (max states = rooms * 2^keys combinations, capped)
  const maxIterations = Math.min(
    connections.length * connections.length * 10,
    100000,
  );
  let iterations = 0;

  while (queueHead < queue.length && iterations++ < maxIterations) {
    const current = queue[queueHead++];
    if (!current) break;

    // Check if we reached the end
    if (current.roomId === endRoomId) {
      return current.path;
    }

    // Collect keys in current room
    const newKeys = new Set(current.keys);
    for (const key of keys) {
      if (key.roomId === current.roomId) {
        newKeys.add(key.type);
      }
    }

    // Create state key for deduplication
    const keysStr = Array.from(newKeys).sort().join(",");
    const stateKey = `${current.roomId}:${keysStr}`;
    const existingLen = visited.get(stateKey);
    if (existingLen !== undefined && existingLen <= current.path.length) {
      continue;
    }
    visited.set(stateKey, current.path.length);

    // Explore neighbors
    for (let i = 0; i < connections.length; i++) {
      const conn = connections[i];
      if (!conn) continue;

      let otherRoom: number | null = null;
      if (conn.fromRoomId === current.roomId) otherRoom = conn.toRoomId;
      else if (conn.toRoomId === current.roomId) otherRoom = conn.fromRoomId;
      else continue;

      // Check if locked
      const lock = locks.find((l) => l.connectionIndex === i);
      if (lock && !newKeys.has(lock.type)) {
        continue;
      }

      queue.push({
        roomId: otherRoom,
        keys: newKeys,
        path: [...current.path, otherRoom],
      });
    }
  }

  return []; // No path found
}

/**
 * Generate lock-and-key progression for a dungeon
 */
export function generateLockAndKeyProgression(
  rooms: readonly Room[],
  connections: readonly Connection[],
  config: Partial<LockAndKeyConfig> = {},
  rng: RNG,
): ProgressionGraph {
  const opts = { ...DEFAULT_LOCK_AND_KEY_CONFIG, ...config };

  // Find entrance and exit rooms
  const entranceRoom = rooms.find((r) => r.type === "entrance");
  const exitRoom = rooms.find((r) => r.type === "exit");

  if (!entranceRoom) {
    return {
      locks: [],
      keys: [],
      solvable: true,
      criticalPath: [],
      keyCountsByType: {},
    };
  }

  // Build room graph and calculate distances
  const roomGraph = buildRoomGraph(rooms, connections);
  const distances = bfsDistances(roomGraph, entranceRoom.id);

  // Select connections to lock
  const locks: Lock[] = [];
  const keys: Key[] = [];
  let keyTypeIndex = 0;

  // Sort connections by distance (prefer locking connections further from entrance)
  const sortedConnections = connections
    .map((conn, idx) => ({
      conn,
      idx,
      minDist: Math.min(
        distances.get(conn.fromRoomId) ?? 0,
        distances.get(conn.toRoomId) ?? 0,
      ),
    }))
    .filter((c) => c.minDist >= opts.minDistanceFromStart)
    .sort((a, b) => b.minDist - a.minDist);

  for (const { conn, idx } of sortedConnections) {
    // Check lock limit
    if (locks.length >= opts.maxLocks) break;

    // Check key types available
    if (keyTypeIndex >= opts.keyTypes.length) break;

    // Random chance to lock
    if (rng.next() > opts.lockProbability) continue;

    // Don't lock the only exit path
    const fromNeighbors = roomGraph.get(conn.fromRoomId)?.size ?? 0;
    const toNeighbors = roomGraph.get(conn.toRoomId)?.size ?? 0;
    if (fromNeighbors <= 1 || toNeighbors <= 1) {
      // This would potentially strand a room
      continue;
    }

    const keyType = opts.keyTypes[keyTypeIndex];
    if (!keyType) continue;
    const lockId = `lock_${idx}_${keyType}`;

    const newLock: Lock = {
      id: lockId,
      type: keyType,
      connectionIndex: idx,
      variant: "door",
    };

    // Try to place the key
    const keyRoom = findKeyPlacement(
      rooms,
      connections,
      distances,
      newLock,
      locks,
      keys,
      rng,
    );

    if (!keyRoom) {
      // Can't place key safely, skip this lock
      continue;
    }

    // Add lock and key
    locks.push(newLock);
    keys.push({
      id: `key_${keyType}`,
      type: keyType,
      roomId: keyRoom.id,
      position: { x: keyRoom.centerX, y: keyRoom.centerY },
      variant: "key",
    });

    keyTypeIndex++;
  }

  // Verify solvability
  const solvable = verifySolvability(
    rooms,
    connections,
    locks,
    keys,
    entranceRoom.id,
  );

  // Calculate critical path
  const criticalPath = exitRoom
    ? calculateCriticalPath(
        rooms,
        connections,
        entranceRoom.id,
        exitRoom.id,
        locks,
        keys,
      )
    : [];

  // Count keys by type
  const keyCountsByType: Record<string, number> = {};
  for (const key of keys) {
    keyCountsByType[key.type] = (keyCountsByType[key.type] ?? 0) + 1;
  }

  return {
    locks,
    keys,
    solvable,
    criticalPath,
    keyCountsByType,
  };
}

/**
 * Apply progression to spawn points
 *
 * Returns additional spawn points for keys and lock markers.
 */
export function applyProgressionToSpawns(progression: ProgressionGraph): Array<{
  type: string;
  position: Point;
  data: Record<string, unknown>;
}> {
  const spawns: Array<{
    type: string;
    position: Point;
    data: Record<string, unknown>;
  }> = [];

  // Add key spawns
  for (const key of progression.keys) {
    spawns.push({
      type: "key",
      position: key.position,
      data: {
        keyType: key.type,
        variant: key.variant,
      },
    });
  }

  return spawns;
}
