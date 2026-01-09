/**
 * Turn Management System
 *
 * Handles turn-based gameplay with energy accumulation model.
 * Entities accumulate energy each tick based on their speed.
 * When an entity reaches the energy threshold (100), it can act.
 */

import type { Entity } from "../../types";
import { SystemPhase } from "../../types";
import { defineSystem } from "../../core/system";
import type { World } from "../../core/world";
import type { EventQueue } from "../../core/events";
import { type TurnEnergyData, ENERGY_THRESHOLD } from "../components/turn";
import type { TurnStateManager, TurnPhase } from "../resources/turn-state";

// Re-export from components for convenience
export { ENERGY_THRESHOLD };

// Maximum fast-forward iterations to prevent infinite loops
const MAX_FAST_FORWARD_ITERATIONS = 1000;

import type { TurnAction } from "../../core/events";

/**
 * Action request submitted by player or AI.
 * Uses the same structure as TurnAction events.
 */
export type ActionRequest = TurnAction;

/**
 * Submits an action for the active entity.
 * Returns true if the action was accepted, false otherwise.
 */
export function submitAction(
  world: World,
  entity: Entity,
  action: ActionRequest,
): boolean {
  const turnState = world.resources.get<TurnStateManager>("turnState");
  if (!turnState) return false;

  const state = turnState.getState();

  // Verify it's this entity's turn and they're in the acting phase
  if (state.activeEntity !== entity || state.turnPhase !== "acting") {
    return false;
  }

  // Emit action event
  const eventQueue = world.resources.get<EventQueue>("eventQueue");
  if (eventQueue) {
    eventQueue.emit({
      type: "turn.action",
      entity,
      action,
      tick: state.currentTick,
    });
  }

  // Transition to resolving phase
  turnState.setPhase("resolving");

  return true;
}

/**
 * Selects the entity with the highest energy that can act.
 * Uses entity ID as tiebreaker for deterministic ordering.
 *
 * Fast-forwards energy if no entity has reached the threshold.
 */
function selectNextActiveEntity(world: World): Entity | null {
  const query = world.query({ with: ["TurnEnergy"], without: [] });
  const energyStore = world.components.getStore<TurnEnergyData>("TurnEnergy");

  if (!energyStore) return null;

  let iterations = 0;

  while (iterations < MAX_FAST_FORWARD_ITERATIONS) {
    iterations++;

    let maxEnergy = 0;
    let selectedEntity: Entity | null = null;

    for (const entity of query.execute()) {
      const energy = energyStore.getField(entity, "energy") ?? 0;

      // Select entity with highest energy
      // Use smaller entity ID as tiebreaker for determinism
      if (
        energy > maxEnergy ||
        (energy === maxEnergy &&
          (selectedEntity === null || entity < selectedEntity))
      ) {
        maxEnergy = energy;
        selectedEntity = entity;
      }
    }

    // Entity can act if energy >= threshold
    if (maxEnergy >= ENERGY_THRESHOLD) {
      return selectedEntity;
    }

    // Try fast-forward if no entity can act yet
    const success = fastForwardEnergy(world);

    if (!success) {
      // No entity can accumulate energy (all have effectiveEpt <= 0)
      console.warn(
        "[TurnSystem] No entity can accumulate energy. " +
          "Check TurnEnergy components (speed/energyPerTurn must be > 0).",
      );
      return null;
    }
  }

  // Safety limit reached
  console.error(
    `[TurnSystem] Max fast-forward iterations (${MAX_FAST_FORWARD_ITERATIONS}) reached. ` +
      "This may indicate a bug in energy calculations.",
  );
  return null;
}

/**
 * Fast-forwards energy for all entities until one can act.
 * Calculates the minimum number of ticks needed for any entity to reach threshold.
 *
 * NOTE: Directly modifies component data (not via commands) since we need immediate effect.
 *
 * @returns true if fast-forward was performed, false if impossible
 */
function fastForwardEnergy(world: World): boolean {
  const query = world.query({ with: ["TurnEnergy"], without: [] });
  const energyStore = world.components.getStore<TurnEnergyData>("TurnEnergy");

  if (!energyStore) return false;

  // Find minimum ticks needed for any entity to reach threshold
  let minTicksNeeded = Infinity;

  for (const entity of query.execute()) {
    const energy = energyStore.getField(entity, "energy") ?? 0;
    const ept = energyStore.getField(entity, "energyPerTurn") ?? 100;
    const speed = energyStore.getField(entity, "speed") ?? 100;
    const effectiveEpt = Math.floor((ept * speed) / 100);

    if (effectiveEpt <= 0) continue;

    const ticksNeeded = Math.ceil((ENERGY_THRESHOLD - energy) / effectiveEpt);
    if (ticksNeeded > 0 && ticksNeeded < minTicksNeeded) {
      minTicksNeeded = ticksNeeded;
    }
  }

  // Impossible if no entity has positive effectiveEpt
  if (minTicksNeeded === Infinity || minTicksNeeded <= 0) {
    return false;
  }

  // Apply fast-forward to all entities (immediate, not via commands)
  for (const entity of query.execute()) {
    const energy = energyStore.getField(entity, "energy") ?? 0;
    const ept = energyStore.getField(entity, "energyPerTurn") ?? 100;
    const speed = energyStore.getField(entity, "speed") ?? 100;
    const effectiveEpt = Math.floor((ept * speed) / 100);

    // Directly update via store for immediate effect
    energyStore.add(entity, {
      energy: energy + effectiveEpt * minTicksNeeded,
      energyPerTurn: ept,
      speed,
    });
  }

  return true;
}

/**
 * Turn Management System
 *
 * Runs in PreUpdate phase to manage turn order before other systems process.
 *
 * Turn flow:
 * 1. waiting -> Select next entity with enough energy
 * 2. acting -> Wait for entity to submit action (player input or AI)
 * 3. resolving -> Consume energy, increment others, end turn
 */
export const TurnManagementSystem = defineSystem("TurnManagement")
  .inPhase(SystemPhase.PreUpdate)
  .execute((world: World) => {
    const turnState = world.resources.get<TurnStateManager>("turnState");
    const eventQueue = world.resources.get<EventQueue>("eventQueue");

    if (!turnState) return;

    const state = turnState.getState();

    // Phase 1: Select next active entity if none
    if (state.activeEntity === null || state.turnPhase === "waiting") {
      const nextEntity = selectNextActiveEntity(world);

      if (nextEntity !== null) {
        turnState.setActiveEntity(nextEntity);

        // Mark entity as active via CommandBuffer
        world.commands.addComponent(nextEntity, "ActiveTurn", {});

        // Emit turn started event
        if (eventQueue) {
          eventQueue.emit({
            type: "turn.started",
            entity: nextEntity,
            tick: state.currentTick,
          });
        }
      }
      return;
    }

    // Phase 2: Wait for action from active entity
    if (state.turnPhase === "acting") {
      // Action will be submitted by input system or AI system
      return;
    }

    // Phase 3: Resolve action and end turn
    if (state.turnPhase === "resolving") {
      const activeEntity = state.activeEntity;
      if (activeEntity === null) return;

      const energyStore =
        world.components.getStore<TurnEnergyData>("TurnEnergy");
      if (!energyStore) return;

      // Consume energy from active entity
      const currentEnergy = energyStore.getField(activeEntity, "energy") ?? 0;
      const energyPerTurn =
        energyStore.getField(activeEntity, "energyPerTurn") ?? 100;
      const speed = energyStore.getField(activeEntity, "speed") ?? 100;

      world.commands.setComponent(activeEntity, "TurnEnergy", {
        energy: currentEnergy - ENERGY_THRESHOLD,
        energyPerTurn,
        speed,
      });

      // Remove ActiveTurn tag
      world.commands.removeComponent(activeEntity, "ActiveTurn");

      // Grant energy to all other entities
      const query = world.query({
        with: ["TurnEnergy"],
        without: ["ActiveTurn"],
      });

      for (const entity of query.execute()) {
        if (entity === activeEntity) continue;

        const e = energyStore.getField(entity, "energy") ?? 0;
        const ept = energyStore.getField(entity, "energyPerTurn") ?? 100;
        const spd = energyStore.getField(entity, "speed") ?? 100;

        // Speed bonus/malus on energy gain
        const energyGain = Math.floor((ept * spd) / 100);

        world.commands.setComponent(entity, "TurnEnergy", {
          energy: e + energyGain,
          energyPerTurn: ept,
          speed: spd,
        });
      }

      // Emit turn ended event
      if (eventQueue) {
        eventQueue.emit({
          type: "turn.ended",
          entity: activeEntity,
          tick: state.currentTick,
        });
      }

      // Advance tick and clear active entity
      turnState.incrementTick();
      turnState.setActiveEntity(null);
    }
  });
