/**
 * Built-in Constraints
 *
 * Pre-defined gameplay constraints for common dungeon requirements.
 * All constraints are deterministic and work with the constraint solver.
 */

import type { Point } from "../../core/geometry/types";
import type { Connection, DungeonStateArtifact, Room } from "../../pipeline/types";
import {
  computeReachableRooms,
  countDisjointPaths,
  pearsonCorrelation,
} from "./solver";
import type {
  Constraint,
  ConstraintContext,
  ConstraintResult,
  ConstraintViolation,
  RepairSuggestion,
} from "./types";

// =============================================================================
// KEY BEFORE LOCK CONSTRAINT
// =============================================================================

/**
 * Ensures player can always reach keys before their corresponding locks.
 * Critical for preventing softlocks in lock-and-key progression.
 */
export function createKeyBeforeLockConstraint(): Constraint {
  return {
    id: "key-before-lock",
    name: "Keys accessible before locks",
    description:
      "Ensures all keys can be collected before encountering their locks",
    priority: "critical",

    evaluate(ctx: ConstraintContext): ConstraintResult {
      const violations: ConstraintViolation[] = [];

      if (!ctx.progression) {
        // No progression system = constraint satisfied
        return {
          constraintId: "key-before-lock",
          satisfied: true,
          score: 1,
          violations: [],
        };
      }

      const { locks, keys } = ctx.progression;
      const entranceRoom = ctx.rooms.find((r) => r.type === "entrance");
      const entranceId = entranceRoom?.id ?? ctx.rooms[0]?.id ?? 0;

      for (const lock of locks) {
        const matchingKey = keys.find((k) => k.type === lock.type);

        if (!matchingKey) {
          violations.push({
            constraint: "key-before-lock",
            message: `No key found for lock type "${lock.type}"`,
            location: { connectionIndex: lock.connectionIndex },
            severity: "error",
          });
          continue;
        }

        // Check if key is reachable without passing through this lock
        const reachableWithoutLock = computeReachableRooms(
          ctx.rooms,
          ctx.connections,
          entranceId,
          new Set([lock.connectionIndex]),
        );

        if (!reachableWithoutLock.has(matchingKey.roomId)) {
          violations.push({
            constraint: "key-before-lock",
            message: `Key "${matchingKey.type}" at room ${matchingKey.roomId} is not reachable before its lock`,
            location: { roomId: matchingKey.roomId },
            severity: "error",
          });
        }
      }

      const score =
        locks.length > 0
          ? 1 - violations.length / locks.length
          : 1;

      return {
        constraintId: "key-before-lock",
        satisfied: violations.length === 0,
        score: Math.max(0, score),
        violations,
      };
    },

    suggest(ctx: ConstraintContext): readonly RepairSuggestion[] {
      if (!ctx.progression) return [];

      const suggestions: RepairSuggestion[] = [];
      const { locks, keys } = ctx.progression;
      const entranceRoom = ctx.rooms.find((r) => r.type === "entrance");
      const entranceId = entranceRoom?.id ?? ctx.rooms[0]?.id ?? 0;

      for (const lock of locks) {
        const matchingKey = keys.find((k) => k.type === lock.type);
        if (!matchingKey) continue;

        const reachableWithoutLock = computeReachableRooms(
          ctx.rooms,
          ctx.connections,
          entranceId,
          new Set([lock.connectionIndex]),
        );

        if (!reachableWithoutLock.has(matchingKey.roomId)) {
          // Suggest moving key to a reachable room
          const reachableRooms = Array.from(reachableWithoutLock);
          if (reachableRooms.length > 0) {
            const targetRoomId = reachableRooms[reachableRooms.length - 1]!;

            suggestions.push({
              type: "move_key",
              description: `Move key "${matchingKey.type}" to room ${targetRoomId}`,
              priority: 10,
              apply: (state) =>
                moveKeyToRoom(state, matchingKey.type, targetRoomId),
            });
          }
        }
      }

      return suggestions;
    },
  };
}

/**
 * Helper to move a key spawn to a different room.
 */
function moveKeyToRoom(
  state: DungeonStateArtifact,
  keyType: string,
  targetRoomId: number,
): DungeonStateArtifact {
  const targetRoom = state.rooms.find((r) => r.id === targetRoomId);
  if (!targetRoom) return state;

  const updatedSpawns = state.spawns.map((spawn) => {
    if (spawn.type === "item" && spawn.tags.includes(`key:${keyType}`)) {
      return {
        ...spawn,
        roomId: targetRoomId,
        position: { x: targetRoom.centerX, y: targetRoom.centerY },
      };
    }
    return spawn;
  });

  return { ...state, spawns: updatedSpawns };
}

// =============================================================================
// MULTI-PATH TO BOSS CONSTRAINT
// =============================================================================

export interface MultiPathToBossConfig {
  minPaths: number;
}

/**
 * Ensures multiple paths exist to the boss room to prevent softlocks.
 */
export function createMultiPathToBossConstraint(
  config: MultiPathToBossConfig = { minPaths: 2 },
): Constraint {
  const { minPaths } = config;

  return {
    id: "multi-path-to-boss",
    name: `At least ${minPaths} paths to boss`,
    description: `Ensures at least ${minPaths} independent paths exist to the boss room`,
    priority: "critical",

    evaluate(ctx: ConstraintContext): ConstraintResult {
      const bossRoom = ctx.rooms.find((r) => r.type === "boss");
      const entranceRoom = ctx.rooms.find((r) => r.type === "entrance");

      if (!bossRoom || !entranceRoom) {
        // No boss or entrance = constraint satisfied (or N/A)
        return {
          constraintId: "multi-path-to-boss",
          satisfied: true,
          score: 1,
          violations: [],
        };
      }

      const pathCount = countDisjointPaths(
        ctx.rooms,
        ctx.connections,
        entranceRoom.id,
        bossRoom.id,
      );

      if (pathCount < minPaths) {
        return {
          constraintId: "multi-path-to-boss",
          satisfied: false,
          score: pathCount / minPaths,
          violations: [
            {
              constraint: "multi-path-to-boss",
              message: `Only ${pathCount} path(s) to boss room, need at least ${minPaths}`,
              location: { roomId: bossRoom.id },
              severity: "error",
            },
          ],
        };
      }

      return {
        constraintId: "multi-path-to-boss",
        satisfied: true,
        score: 1,
        violations: [],
      };
    },

    suggest(ctx: ConstraintContext): readonly RepairSuggestion[] {
      const bossRoom = ctx.rooms.find((r) => r.type === "boss");
      const entranceRoom = ctx.rooms.find((r) => r.type === "entrance");

      if (!bossRoom || !entranceRoom) return [];

      const suggestions: RepairSuggestion[] = [];

      // Find rooms near boss that aren't directly connected
      const bossNeighbors = new Set<number>();
      for (const conn of ctx.connections) {
        if (conn.fromRoomId === bossRoom.id) bossNeighbors.add(conn.toRoomId);
        if (conn.toRoomId === bossRoom.id) bossNeighbors.add(conn.fromRoomId);
      }

      const candidates = ctx.rooms.filter((r) => {
        if (r.id === bossRoom.id) return false;
        if (bossNeighbors.has(r.id)) return false;
        // Prefer rooms that are not too close to entrance
        const distance = ctx.roomDistances.get(r.id) ?? 0;
        const maxDistance = Math.max(...Array.from(ctx.roomDistances.values()));
        return distance > maxDistance * 0.3;
      });

      // Sort by distance to boss (prefer closer rooms)
      candidates.sort((a, b) => {
        const distA = Math.abs(a.centerX - bossRoom.centerX) + Math.abs(a.centerY - bossRoom.centerY);
        const distB = Math.abs(b.centerX - bossRoom.centerX) + Math.abs(b.centerY - bossRoom.centerY);
        return distA - distB;
      });

      for (const room of candidates.slice(0, 3)) {
        suggestions.push({
          type: "add_connection",
          description: `Add shortcut from room ${room.id} to boss room ${bossRoom.id}`,
          priority: 8,
          apply: (state) => addConnection(state, room.id, bossRoom.id),
        });
      }

      return suggestions;
    },
  };
}

/**
 * Helper to add a connection between two rooms.
 */
function addConnection(
  state: DungeonStateArtifact,
  fromRoomId: number,
  toRoomId: number,
): DungeonStateArtifact {
  const fromRoom = state.rooms.find((r) => r.id === fromRoomId);
  const toRoom = state.rooms.find((r) => r.id === toRoomId);

  if (!fromRoom || !toRoom) return state;

  // Create simple L-shaped path
  const path: Point[] = [];
  const startX = fromRoom.centerX;
  const startY = fromRoom.centerY;
  const endX = toRoom.centerX;
  const endY = toRoom.centerY;

  // Horizontal first
  for (let x = Math.min(startX, endX); x <= Math.max(startX, endX); x++) {
    path.push({ x, y: startY });
  }
  // Then vertical
  for (let y = Math.min(startY, endY); y <= Math.max(startY, endY); y++) {
    path.push({ x: endX, y });
  }

  const newConnection: Connection = {
    fromRoomId,
    toRoomId,
    path,
  };

  return {
    ...state,
    connections: [...state.connections, newConnection],
  };
}

// =============================================================================
// FULL CONNECTIVITY CONSTRAINT
// =============================================================================

/**
 * Ensures all rooms are reachable from the entrance.
 */
export function createFullConnectivityConstraint(): Constraint {
  return {
    id: "full-connectivity",
    name: "All rooms reachable",
    description: "Ensures all rooms can be reached from the entrance",
    priority: "critical",

    evaluate(ctx: ConstraintContext): ConstraintResult {
      const entranceRoom = ctx.rooms.find((r) => r.type === "entrance");
      const entranceId = entranceRoom?.id ?? ctx.rooms[0]?.id ?? 0;

      const reachable = computeReachableRooms(
        ctx.rooms,
        ctx.connections,
        entranceId,
      );

      const unreachable = ctx.rooms.filter((r) => !reachable.has(r.id));

      if (unreachable.length === 0) {
        return {
          constraintId: "full-connectivity",
          satisfied: true,
          score: 1,
          violations: [],
        };
      }

      const violations: ConstraintViolation[] = unreachable.map((room) => ({
        constraint: "full-connectivity",
        message: `Room ${room.id} (${room.type}) is not reachable from entrance`,
        location: { roomId: room.id },
        severity: "error",
      }));

      return {
        constraintId: "full-connectivity",
        satisfied: false,
        score: reachable.size / ctx.rooms.length,
        violations,
      };
    },

    suggest(ctx: ConstraintContext): readonly RepairSuggestion[] {
      const entranceRoom = ctx.rooms.find((r) => r.type === "entrance");
      const entranceId = entranceRoom?.id ?? ctx.rooms[0]?.id ?? 0;

      const reachable = computeReachableRooms(
        ctx.rooms,
        ctx.connections,
        entranceId,
      );

      const unreachable = ctx.rooms.filter((r) => !reachable.has(r.id));
      const suggestions: RepairSuggestion[] = [];

      for (const room of unreachable) {
        // Find closest reachable room
        let closestReachable: Room | null = null;
        let closestDistance = Infinity;

        for (const reachableId of reachable) {
          const reachableRoom = ctx.rooms.find((r) => r.id === reachableId);
          if (!reachableRoom) continue;

          const dist =
            Math.abs(room.centerX - reachableRoom.centerX) +
            Math.abs(room.centerY - reachableRoom.centerY);

          if (dist < closestDistance) {
            closestDistance = dist;
            closestReachable = reachableRoom;
          }
        }

        if (closestReachable) {
          suggestions.push({
            type: "add_connection",
            description: `Connect unreachable room ${room.id} to room ${closestReachable.id}`,
            priority: 10,
            apply: (state) => addConnection(state, closestReachable!.id, room.id),
          });
        }
      }

      return suggestions;
    },
  };
}

// =============================================================================
// SECRET ROOM BACKTRACK CONSTRAINT
// =============================================================================

/**
 * Ensures secret/treasure rooms are off the main path (dead ends).
 */
export function createSecretRoomBacktrackConstraint(): Constraint {
  return {
    id: "secret-room-backtrack",
    name: "Secret rooms require backtracking",
    description: "Ensures secret/treasure rooms are not on the main path",
    priority: "nice-to-have",

    evaluate(ctx: ConstraintContext): ConstraintResult {
      const secretRooms = ctx.rooms.filter(
        (r) =>
          r.type === "treasure" ||
          (r.traits?.secret !== undefined && r.traits.secret > 0.5),
      );

      if (secretRooms.length === 0) {
        return {
          constraintId: "secret-room-backtrack",
          satisfied: true,
          score: 1,
          violations: [],
        };
      }

      const violations: ConstraintViolation[] = [];

      for (const room of secretRooms) {
        const meta = ctx.roomMetadata.get(room.id);
        if (meta && !meta.isDeadEnd && meta.isOnCriticalPath) {
          violations.push({
            constraint: "secret-room-backtrack",
            message: `Secret room ${room.id} is on main path, should be off-path`,
            location: { roomId: room.id },
            severity: "warning",
          });
        }
      }

      return {
        constraintId: "secret-room-backtrack",
        satisfied: violations.length === 0,
        score: 1 - violations.length / secretRooms.length,
        violations,
      };
    },
  };
}

// =============================================================================
// MINIMUM ROOM COUNT CONSTRAINT
// =============================================================================

export interface MinRoomCountConfig {
  minRooms: number;
}

/**
 * Ensures dungeon has at least a minimum number of rooms.
 */
export function createMinRoomCountConstraint(
  config: MinRoomCountConfig = { minRooms: 5 },
): Constraint {
  const { minRooms } = config;

  return {
    id: "min-room-count",
    name: `At least ${minRooms} rooms`,
    description: `Ensures dungeon has at least ${minRooms} rooms`,
    priority: "important",

    evaluate(ctx: ConstraintContext): ConstraintResult {
      const count = ctx.rooms.length;
      const satisfied = count >= minRooms;

      return {
        constraintId: "min-room-count",
        satisfied,
        score: Math.min(1, count / minRooms),
        violations: satisfied
          ? []
          : [
              {
                constraint: "min-room-count",
                message: `Only ${count} rooms, need at least ${minRooms}`,
                severity: "warning",
              },
            ],
      };
    },
  };
}

// =============================================================================
// EXPORTS: CONSTRAINT PRESETS
// =============================================================================

/**
 * Default set of structural constraints for dungeons.
 */
export function createDefaultConstraints(): Constraint[] {
  return [
    createFullConnectivityConstraint(),
    createMinRoomCountConstraint({ minRooms: 5 }),
  ];
}

/**
 * Strict constraints for dungeons with lock-and-key progression.
 */
export function createProgressionConstraints(): Constraint[] {
  return [
    createKeyBeforeLockConstraint(),
    createMultiPathToBossConstraint({ minPaths: 2 }),
    createFullConnectivityConstraint(),
    createSecretRoomBacktrackConstraint(),
  ];
}
