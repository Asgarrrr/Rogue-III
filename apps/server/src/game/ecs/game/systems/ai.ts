/**
 * AI System
 *
 * State machine AI for NPCs and monsters.
 * States: idle, patrol, chase, attack, flee, wander
 */

import type { Entity } from "../../types";
import { SystemPhase } from "../../types";
import { defineSystem } from "../../core/system";
import type { World } from "../../core/world";
import type { PositionData, VelocityData } from "../components/spatial";
import type { AIData, AIState } from "../components/actor";
import type { HealthData, CombatStatsData } from "../components/stats";
import type { TurnStateManager } from "../resources/turn-state";
import { submitAction } from "./turn";
import type { SeededRandom } from "../../../dungeon/core/random/seeded-random";

// AI configuration constants
const CHASE_RANGE = 10; // Start chasing player if within this range
const LOSE_SIGHT_RANGE = 15; // Stop chasing if player is beyond this range
const ATTACK_RANGE = 1.5; // Attack if within this range
const FLEE_HEALTH_THRESHOLD = 0.2; // Flee if health below 20%

/**
 * Calculates Manhattan distance between two positions.
 */
function manhattanDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  return Math.abs(x2 - x1) + Math.abs(y2 - y1);
}

/**
 * Calculates Euclidean distance between two positions.
 */
function euclideanDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Gets the direction towards a target position.
 */
function getDirectionTowards(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): { dx: number; dy: number } {
  const dx = toX - fromX;
  const dy = toY - fromY;
  return {
    dx: Math.sign(dx),
    dy: Math.sign(dy),
  };
}

/**
 * Gets a random direction for wandering.
 * Uses SeededRandom for deterministic behavior.
 */
function getRandomDirection(rng: SeededRandom): { dx: number; dy: number } {
  const directions = [
    { dx: 0, dy: -1 }, // Up
    { dx: 0, dy: 1 }, // Down
    { dx: -1, dy: 0 }, // Left
    { dx: 1, dy: 0 }, // Right
    { dx: -1, dy: -1 }, // Up-left
    { dx: 1, dy: -1 }, // Up-right
    { dx: -1, dy: 1 }, // Down-left
    { dx: 1, dy: 1 }, // Down-right
    { dx: 0, dy: 0 }, // Stay
  ];
  return rng.choice(directions);
}

/**
 * AI Decision System
 *
 * Processes AI state machine for entities with AI component.
 * Only runs when it's the AI entity's turn.
 */
export const AISystem = defineSystem("AI")
  .inPhase(SystemPhase.Update)
  .execute((world: World) => {
    const turnState = world.resources.get<TurnStateManager>("turnState");
    if (!turnState) return;

    const rng = world.resources.get<SeededRandom>("gameRng");
    if (!rng) return;

    const state = turnState.getState();

    // Only process during acting phase
    if (state.turnPhase !== "acting" || state.activeEntity === null) return;

    const activeEntity = state.activeEntity;

    // Check if active entity has AI (is not player)
    const ai = world.getComponent<AIData>(activeEntity, "AI");
    if (!ai) return; // Player or non-AI entity

    const pos = world.getComponent<PositionData>(activeEntity, "Position");
    if (!pos) return;

    // Find player entity
    const playerQuery = world.query({
      with: ["Player", "Position"],
      without: [],
    });
    const players = playerQuery.execute();

    if (players.length === 0) {
      // No player, just wander
      handleWander(world, activeEntity, pos, rng);
      return;
    }

    const player = players[0];
    const playerPos = world.getComponent<PositionData>(player, "Position");
    if (!playerPos) return;

    // Calculate distance to player
    const distance = euclideanDistance(pos.x, pos.y, playerPos.x, playerPos.y);

    // Check own health for flee behavior
    const health = world.getComponent<HealthData>(activeEntity, "Health");
    const healthPercent = health ? health.current / health.max : 1;

    // State machine transitions
    const newState = updateAIState(ai, distance, healthPercent, player, rng);

    // Update AI state if changed
    if (newState !== ai.state) {
      world.setComponent(activeEntity, "AI", {
        ...ai,
        state: newState,
        target:
          newState === "chase" || newState === "attack"
            ? player
            : (0 as Entity),
      });
    }

    // Execute behavior based on state
    executeAIBehavior(world, activeEntity, ai.state, pos, playerPos, rng);
  });

/**
 * Updates AI state based on conditions.
 */
function updateAIState(
  ai: AIData,
  distanceToPlayer: number,
  healthPercent: number,
  player: Entity,
  rng: SeededRandom,
): AIState {
  // Priority: flee > attack > chase > idle/patrol/wander

  // Check flee condition
  if (healthPercent < FLEE_HEALTH_THRESHOLD) {
    return "flee";
  }

  // State-specific transitions
  switch (ai.state) {
    case "idle":
    case "wander":
    case "patrol":
      // Transition to chase if player in range
      if (distanceToPlayer < CHASE_RANGE) {
        return "chase";
      }
      // Occasionally start wandering from idle (10% chance)
      if (ai.state === "idle" && rng.probability(0.1)) {
        return "wander";
      }
      return ai.state;

    case "chase":
      // Transition to attack if close enough
      if (distanceToPlayer < ATTACK_RANGE) {
        return "attack";
      }
      // Lose interest if too far
      if (distanceToPlayer > LOSE_SIGHT_RANGE) {
        return "idle";
      }
      return "chase";

    case "attack":
      // Back to chase if player moved away
      if (distanceToPlayer >= ATTACK_RANGE) {
        return "chase";
      }
      return "attack";

    case "flee":
      // Stop fleeing if health recovered or safe distance
      if (
        healthPercent > FLEE_HEALTH_THRESHOLD * 1.5 ||
        distanceToPlayer > LOSE_SIGHT_RANGE
      ) {
        return "idle";
      }
      return "flee";

    default:
      return "idle";
  }
}

/**
 * Executes behavior for current AI state.
 */
function executeAIBehavior(
  world: World,
  entity: Entity,
  state: AIState,
  pos: PositionData,
  playerPos: PositionData,
  rng: SeededRandom,
): void {
  switch (state) {
    case "idle":
      submitAction(world, entity, { type: "wait" });
      break;

    case "wander":
      handleWander(world, entity, pos, rng);
      break;

    case "patrol":
      // TODO: Implement patrol path
      handleWander(world, entity, pos, rng);
      break;

    case "chase":
      handleChase(world, entity, pos, playerPos);
      break;

    case "attack":
      handleAttack(world, entity, playerPos);
      break;

    case "flee":
      handleFlee(world, entity, pos, playerPos);
      break;
  }
}

function handleWander(
  world: World,
  entity: Entity,
  pos: PositionData,
  rng: SeededRandom,
): void {
  const dir = getRandomDirection(rng);
  if (dir.dx === 0 && dir.dy === 0) {
    submitAction(world, entity, { type: "wait" });
  } else {
    submitAction(world, entity, {
      type: "move",
      data: { dx: dir.dx, dy: dir.dy },
    });
  }
}

/**
 * Handles chase behavior - move towards player.
 */
function handleChase(
  world: World,
  entity: Entity,
  pos: PositionData,
  playerPos: PositionData,
): void {
  const dir = getDirectionTowards(pos.x, pos.y, playerPos.x, playerPos.y);
  submitAction(world, entity, {
    type: "move",
    data: { dx: dir.dx, dy: dir.dy },
  });
}

/**
 * Handles attack behavior - attack the player.
 */
function handleAttack(
  world: World,
  entity: Entity,
  playerPos: PositionData,
): void {
  // Find player entity
  const playerQuery = world.query({ with: ["Player"], without: [] });
  const players = playerQuery.execute();

  if (players.length > 0) {
    submitAction(world, entity, {
      type: "attack",
      data: { target: players[0] },
    });
  } else {
    submitAction(world, entity, { type: "wait" });
  }
}

/**
 * Handles flee behavior - move away from player.
 */
function handleFlee(
  world: World,
  entity: Entity,
  pos: PositionData,
  playerPos: PositionData,
): void {
  // Move in opposite direction from player
  const dir = getDirectionTowards(pos.x, pos.y, playerPos.x, playerPos.y);
  submitAction(world, entity, {
    type: "move",
    data: { dx: -dir.dx, dy: -dir.dy },
  });
}
