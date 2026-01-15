/**
 * Virtual Walker
 *
 * Simulates a virtual player traversing the dungeon.
 * Detects softlocks, measures difficulty, and validates playability.
 */

import { buildAdjacencyFromConnections } from "../../passes/connectivity/graph-algorithms";
import type {
  Connection,
  DungeonStateArtifact,
  Room,
  SpawnPoint,
} from "../../pipeline/types";
import type { ProgressionGraph } from "../constraints/types";
import type {
  DifficultySpike,
  ExplorationStrategy,
  SimulationConfig,
  SimulationEvent,
  SimulationInventory,
  SimulationMetrics,
  SimulationState,
  SoftlockInfo,
  WalkerResult,
} from "./types";
import { DEFAULT_SIMULATION_CONFIG } from "./types";

// =============================================================================
// STATE MANAGEMENT
// =============================================================================

/**
 * Create initial simulation state.
 */
function createInitialState(
  config: SimulationConfig,
  startRoomId: number,
): SimulationState {
  return {
    currentRoomId: startRoomId,
    visitedRooms: new Set([startRoomId]),
    inventory: {
      potions: config.startPotions,
      ammo: config.startAmmo,
      gold: 0,
      keys: new Set(),
    },
    health: config.startHealth,
    maxHealth: config.maxHealth,
    steps: 0,
    history: [
      {
        step: 0,
        type: "enter_room",
        roomId: startRoomId,
      },
    ],
  };
}

/**
 * Add an event to the simulation history.
 */
function addEvent(
  state: SimulationState,
  type: SimulationEvent["type"],
  roomId: number,
  data?: Record<string, unknown>,
): SimulationState {
  const event: SimulationEvent = {
    step: state.steps,
    type,
    roomId,
    data,
  };

  return {
    ...state,
    history: [...state.history, event],
  };
}

/**
 * Move to a new room.
 */
function moveToRoom(state: SimulationState, roomId: number): SimulationState {
  const newVisited = new Set(state.visitedRooms);
  newVisited.add(roomId);

  return addEvent(
    {
      ...state,
      currentRoomId: roomId,
      visitedRooms: newVisited,
      steps: state.steps + 1,
    },
    "enter_room",
    roomId,
  );
}

/**
 * Collect a key.
 */
function collectKey(state: SimulationState, keyType: string): SimulationState {
  const newKeys = new Set(state.inventory.keys);
  newKeys.add(keyType);

  return addEvent(
    {
      ...state,
      inventory: {
        ...state.inventory,
        keys: newKeys,
      },
    },
    "collect_key",
    state.currentRoomId,
    { keyType },
  );
}

/**
 * Take damage and possibly use a potion.
 */
function takeDamage(
  state: SimulationState,
  damage: number,
  config: SimulationConfig,
): SimulationState {
  let newHealth = state.health - damage;
  let newPotions = state.inventory.potions;

  let updatedState = addEvent(state, "combat", state.currentRoomId, {
    damage,
    healthBefore: state.health,
  });

  // Use potion if health drops below threshold and we have potions
  const healthRatio = newHealth / config.maxHealth;
  if (healthRatio < config.usePotionThreshold && newPotions > 0) {
    newHealth = Math.min(newHealth + config.potionHeal, config.maxHealth);
    newPotions--;
    updatedState = addEvent(updatedState, "use_potion", state.currentRoomId, {
      healthRestored: config.potionHeal,
    });
  }

  return {
    ...updatedState,
    health: newHealth,
    inventory: {
      ...updatedState.inventory,
      potions: newPotions,
    },
  };
}

// =============================================================================
// ROOM PROCESSING
// =============================================================================

/**
 * Process the current room (handle spawns).
 */
function processRoom(
  state: SimulationState,
  room: Room,
  spawns: readonly SpawnPoint[],
  config: SimulationConfig,
  rng: () => number,
): SimulationState {
  let currentState = state;
  const roomSpawns = spawns.filter((s) => s.roomId === room.id);

  for (const spawn of roomSpawns) {
    switch (spawn.type) {
      case "enemy": {
        // Take damage from enemy
        const damage = Math.round(config.enemyDamage * spawn.weight);
        currentState = takeDamage(currentState, damage, config);

        // Check for death
        if (currentState.health <= 0) {
          currentState = addEvent(currentState, "death", room.id, {
            cause: "combat",
          });
          return currentState;
        }
        break;
      }

      case "treasure": {
        currentState = addEvent(currentState, "collect_treasure", room.id, {
          weight: spawn.weight,
        });
        currentState = {
          ...currentState,
          inventory: {
            ...currentState.inventory,
            gold: currentState.inventory.gold + Math.round(spawn.weight * 100),
          },
        };
        break;
      }

      case "item": {
        // Check if it's a key
        const keyTag = spawn.tags.find((t) => t.startsWith("key:"));
        if (keyTag) {
          const keyType = keyTag.substring(4);
          if (!currentState.inventory.keys.has(keyType)) {
            currentState = collectKey(currentState, keyType);
          }
        }

        // Check if it's a potion
        if (spawn.tags.includes("potion")) {
          currentState = addEvent(currentState, "collect_potion", room.id);
          currentState = {
            ...currentState,
            inventory: {
              ...currentState.inventory,
              potions: currentState.inventory.potions + 1,
            },
          };
        }
        break;
      }
    }
  }

  return currentState;
}

// =============================================================================
// NAVIGATION
// =============================================================================

/**
 * Get reachable neighbors from current room.
 */
function getReachableNeighbors(
  currentRoomId: number,
  adjacency: Map<number, number[]>,
  connections: readonly Connection[],
  progression: ProgressionGraph | null,
  collectedKeys: ReadonlySet<string>,
): number[] {
  const neighbors = adjacency.get(currentRoomId) ?? [];

  if (!progression || progression.locks.length === 0) {
    return neighbors;
  }

  // Filter out locked connections
  return neighbors.filter((neighborId) => {
    const connectionIndex = connections.findIndex(
      (c) =>
        (c.fromRoomId === currentRoomId && c.toRoomId === neighborId) ||
        (c.toRoomId === currentRoomId && c.fromRoomId === neighborId),
    );

    const lock = progression.locks.find(
      (l) => l.connectionIndex === connectionIndex,
    );

    if (!lock) return true;

    // Check if we have the key
    return collectedKeys.has(lock.type);
  });
}

/**
 * Select candidates for next room based on strategy.
 */
function selectNextRoomCandidates(
  reachableNeighbors: number[],
  visitedRooms: ReadonlySet<number>,
  rooms: readonly Room[],
  strategy: ExplorationStrategy,
): number[] {
  // Prefer unvisited rooms
  const unvisited = reachableNeighbors.filter((id) => !visitedRooms.has(id));

  if (unvisited.length > 0) {
    return prioritizeByStrategy(unvisited, rooms, strategy);
  }

  // If all neighbors visited, allow backtracking
  return reachableNeighbors;
}

/**
 * Prioritize rooms by exploration strategy.
 */
function prioritizeByStrategy(
  roomIds: number[],
  rooms: readonly Room[],
  strategy: ExplorationStrategy,
): number[] {
  const roomsWithData = roomIds.map((id) => ({
    id,
    room: rooms.find((r) => r.id === id),
  }));

  switch (strategy) {
    case "shortest_path":
      // Prefer exit rooms
      return roomsWithData
        .sort((a, b) => {
          if (a.room?.type === "exit") return -1;
          if (b.room?.type === "exit") return 1;
          return 0;
        })
        .map((r) => r.id);

    case "treasure_hunter":
      // Prefer treasure rooms
      return roomsWithData
        .sort((a, b) => {
          if (a.room?.type === "treasure") return -1;
          if (b.room?.type === "treasure") return 1;
          return 0;
        })
        .map((r) => r.id);

    case "cautious":
      // Avoid boss rooms until necessary
      return roomsWithData
        .sort((a, b) => {
          if (a.room?.type === "boss") return 1;
          if (b.room?.type === "boss") return -1;
          return 0;
        })
        .map((r) => r.id);

    case "completionist":
    default:
      // Visit everything, but prefer non-boss first
      return roomsWithData
        .sort((a, b) => {
          if (a.room?.type === "boss") return 1;
          if (b.room?.type === "boss") return -1;
          return 0;
        })
        .map((r) => r.id);
  }
}

/**
 * Select the next room to visit.
 */
function selectNextRoom(
  candidates: number[],
  strategy: ExplorationStrategy,
  rng: () => number,
): number {
  if (candidates.length === 0) {
    throw new Error("No candidates to select from");
  }

  // First candidate is highest priority
  return candidates[0]!;
}

// =============================================================================
// SOFTLOCK DETECTION
// =============================================================================

/**
 * Find rooms that are unreachable from current state.
 */
function findUnreachableRooms(
  state: SimulationState,
  dungeon: DungeonStateArtifact,
  progression: ProgressionGraph | null,
): number[] {
  const adjacency = buildAdjacencyFromConnections(dungeon.rooms, dungeon.connections);
  const reachable = new Set<number>();
  const queue: number[] = [state.currentRoomId];
  let queueHead = 0;
  reachable.add(state.currentRoomId);

  while (queueHead < queue.length) {
    const current = queue[queueHead++];
    if (current === undefined) break;

    const neighbors = getReachableNeighbors(
      current,
      adjacency,
      dungeon.connections,
      progression,
      state.inventory.keys,
    );

    for (const neighbor of neighbors) {
      if (!reachable.has(neighbor)) {
        reachable.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return dungeon.rooms
    .filter((r) => !reachable.has(r.id))
    .map((r) => r.id);
}

/**
 * Find missing keys needed to reach a target room.
 */
function findMissingKeys(
  currentRoomId: number,
  targetRoomId: number,
  dungeon: DungeonStateArtifact,
  progression: ProgressionGraph | null,
  collectedKeys: ReadonlySet<string>,
): string[] {
  if (!progression) return [];

  const missingKeys: string[] = [];

  for (const lock of progression.locks) {
    if (!collectedKeys.has(lock.type)) {
      missingKeys.push(lock.type);
    }
  }

  return missingKeys;
}

// =============================================================================
// METRICS CALCULATION
// =============================================================================

/**
 * Calculate simulation metrics from final state.
 */
function calculateMetrics(
  state: SimulationState,
  dungeon: DungeonStateArtifact,
  difficultySpikes: DifficultySpike[],
  config: SimulationConfig,
): SimulationMetrics {
  const combatEvents = state.history.filter((e) => e.type === "combat");
  const treasureEvents = state.history.filter((e) => e.type === "collect_treasure");
  const keyEvents = state.history.filter((e) => e.type === "collect_key");
  const potionEvents = state.history.filter((e) => e.type === "use_potion");
  const unlockEvents = state.history.filter((e) => e.type === "unlock_door");

  const totalDamage = combatEvents.reduce(
    (sum, e) => sum + ((e.data?.damage as number) ?? 0),
    0,
  );

  const avgDifficulty =
    combatEvents.length > 0
      ? totalDamage / combatEvents.length / config.enemyDamage
      : 0;

  return {
    totalSteps: state.steps,
    roomsVisited: state.visitedRooms.size,
    roomsTotal: dungeon.rooms.length,
    completionRatio: state.visitedRooms.size / dungeon.rooms.length,

    combatEncounters: combatEvents.length,
    totalDamageReceived: totalDamage,
    potionsUsed: potionEvents.length,
    ammoUsed: combatEvents.length * config.ammoCostPerEnemy,

    treasuresFound: treasureEvents.length,
    keysCollected: keyEvents.length,
    doorsUnlocked: unlockEvents.length,

    healthRemaining: state.health,
    healthRemainingRatio: state.health / config.maxHealth,

    difficultySpikes,
    averageDifficulty: avgDifficulty,
  };
}

// =============================================================================
// MAIN SIMULATION
// =============================================================================

/**
 * Simulate a playthrough of the dungeon.
 */
export function simulatePlaythrough(
  dungeon: DungeonStateArtifact,
  progression: ProgressionGraph | null,
  config: Partial<SimulationConfig>,
  rng: () => number,
): WalkerResult {
  const startTime = performance.now();
  const fullConfig: SimulationConfig = { ...DEFAULT_SIMULATION_CONFIG, ...config };

  // Find entrance room
  const entranceRoom = dungeon.rooms.find((r) => r.type === "entrance");
  if (!entranceRoom) {
    return {
      completed: false,
      reachedExit: false,
      finalState: createInitialState(fullConfig, 0),
      metrics: {
        totalSteps: 0,
        roomsVisited: 0,
        roomsTotal: dungeon.rooms.length,
        completionRatio: 0,
        combatEncounters: 0,
        totalDamageReceived: 0,
        potionsUsed: 0,
        ammoUsed: 0,
        treasuresFound: 0,
        keysCollected: 0,
        doorsUnlocked: 0,
        healthRemaining: 0,
        healthRemainingRatio: 0,
        difficultySpikes: [],
        averageDifficulty: 0,
      },
      softlocks: [
        {
          step: 0,
          roomId: 0,
          reason: "No entrance room found",
          unreachableRooms: dungeon.rooms.map((r) => r.id),
        },
      ],
      pathTaken: [],
      durationMs: performance.now() - startTime,
    };
  }

  let state = createInitialState(fullConfig, entranceRoom.id);
  const pathTaken: number[] = [entranceRoom.id];
  const softlocks: SoftlockInfo[] = [];
  const difficultySpikes: DifficultySpike[] = [];

  const adjacency = buildAdjacencyFromConnections(dungeon.rooms, dungeon.connections);

  // Process entrance room
  state = processRoom(state, entranceRoom, dungeon.spawns, fullConfig, rng);

  while (state.steps < fullConfig.maxSteps) {
    // Check if dead
    if (state.health <= 0) {
      break;
    }

    // Check if we reached the exit
    const currentRoom = dungeon.rooms.find((r) => r.id === state.currentRoomId);
    if (currentRoom?.type === "exit") {
      state = addEvent(state, "reach_exit", state.currentRoomId);
      break;
    }

    // Get reachable neighbors
    const reachableNeighbors = getReachableNeighbors(
      state.currentRoomId,
      adjacency,
      dungeon.connections,
      progression,
      state.inventory.keys,
    );

    // Select candidates
    const candidates = selectNextRoomCandidates(
      reachableNeighbors,
      state.visitedRooms,
      dungeon.rooms,
      fullConfig.explorationStrategy,
    );

    if (candidates.length === 0) {
      // Check for softlock
      const exitRoom = dungeon.rooms.find((r) => r.type === "exit");
      if (exitRoom && !state.visitedRooms.has(exitRoom.id)) {
        const missingKeys = findMissingKeys(
          state.currentRoomId,
          exitRoom.id,
          dungeon,
          progression,
          state.inventory.keys,
        );

        const unreachable = findUnreachableRooms(state, dungeon, progression);

        softlocks.push({
          step: state.steps,
          roomId: state.currentRoomId,
          reason:
            missingKeys.length > 0
              ? `Missing keys: ${missingKeys.join(", ")}`
              : "No path to exit",
          requiredKey: missingKeys[0],
          unreachableRooms: unreachable,
        });

        state = addEvent(state, "softlock", state.currentRoomId, {
          missingKeys,
          unreachableRooms: unreachable,
        });
        break;
      }

      // No exit or already visited all - simulation complete
      break;
    }

    // Move to next room
    const nextRoomId = selectNextRoom(
      candidates,
      fullConfig.explorationStrategy,
      rng,
    );

    const healthBefore = state.health;
    state = moveToRoom(state, nextRoomId);
    pathTaken.push(nextRoomId);

    // Process the room
    const nextRoom = dungeon.rooms.find((r) => r.id === nextRoomId);
    if (nextRoom) {
      state = processRoom(state, nextRoom, dungeon.spawns, fullConfig, rng);

      // Check for difficulty spike
      const healthAfter = state.health;
      const damageReceived = healthBefore - healthAfter;

      if (damageReceived > fullConfig.enemyDamage * 1.5) {
        const severity: DifficultySpike["severity"] =
          damageReceived > fullConfig.enemyDamage * 3
            ? "severe"
            : damageReceived > fullConfig.enemyDamage * 2
              ? "moderate"
              : "minor";

        difficultySpikes.push({
          roomId: nextRoomId,
          step: state.steps,
          damageReceived,
          healthBefore,
          healthAfter,
          severity,
        });
      }
    }
  }

  const reachedExit = state.history.some((e) => e.type === "reach_exit");
  const completed = reachedExit || state.visitedRooms.size === dungeon.rooms.length;

  return {
    completed,
    reachedExit,
    finalState: state,
    metrics: calculateMetrics(state, dungeon, difficultySpikes, fullConfig),
    softlocks,
    pathTaken,
    durationMs: performance.now() - startTime,
  };
}
