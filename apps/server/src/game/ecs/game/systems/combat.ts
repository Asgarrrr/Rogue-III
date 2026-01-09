/**
 * Combat System
 *
 * Resolves combat between entities using AttackRequest component.
 * Calculates damage based on attacker's attack vs defender's defense.
 */

import type { Entity } from "../../types";
import { SystemPhase } from "../../types";
import { defineSystem } from "../../core/system";
import { ComponentSchema, ComponentType } from "../../core/component";
import type { World } from "../../core/world";
import type { EventQueue } from "../../core/events";
import type { HealthData, CombatStatsData } from "../components/stats";
import type { SeededRandom } from "../../../dungeon/core/random/seeded-random";

/**
 * AttackRequest Component
 *
 * Added to entities that want to attack.
 * Removed after combat resolution.
 */
export interface AttackRequestData {
  target: number; // Entity ID
}

export const AttackRequestSchema = ComponentSchema.define<AttackRequestData>(
  "AttackRequest",
)
  .field("target", ComponentType.U32, 0)
  .build();

/**
 * Combat result information.
 */
export interface CombatResult {
  readonly attacker: Entity;
  readonly target: Entity;
  readonly damage: number;
  readonly targetDied: boolean;
  readonly critical: boolean;
}

function calculateDamage(
  attackerStats: CombatStatsData,
  targetStats: CombatStatsData,
  rng: SeededRandom,
): { damage: number; critical: boolean } {
  const baseDamage = Math.max(1, attackerStats.attack - targetStats.defense);
  const critical = rng.probability(0.1);
  const damage = critical ? baseDamage * 2 : baseDamage;

  return { damage, critical };
}

/**
 * Combat System
 *
 * Processes AttackRequest components and resolves combat.
 * Emits combat.damage and entity.died events.
 */
export const CombatSystem = defineSystem("Combat")
  .inPhase(SystemPhase.Update)
  .execute((world: World) => {
    const query = world.query({ with: ["AttackRequest"], without: [] });
    const eventQueue = world.resources.get<EventQueue>("eventQueue");
    const rng = world.resources.get<SeededRandom>("gameRng");

    if (!rng) return;

    for (const attacker of query.execute()) {
      const request = world.getComponent<AttackRequestData>(
        attacker,
        "AttackRequest",
      );
      if (!request) continue;

      const target = request.target as Entity;

      // Validate target still exists
      if (!world.isAlive(target)) {
        world.removeComponent(attacker, "AttackRequest");
        continue;
      }

      // Get stats
      const attackerStats = world.getComponent<CombatStatsData>(
        attacker,
        "CombatStats",
      );
      const targetHealth = world.getComponent<HealthData>(target, "Health");
      const targetStats = world.getComponent<CombatStatsData>(
        target,
        "CombatStats",
      );

      if (!attackerStats || !targetHealth) {
        world.removeComponent(attacker, "AttackRequest");
        continue;
      }

      // Default defense if no CombatStats component
      const effectiveTargetStats: CombatStatsData = targetStats ?? {
        attack: 0,
        defense: 0,
        accuracy: 80,
        evasion: 10,
      };

      const { damage, critical } = calculateDamage(
        attackerStats,
        effectiveTargetStats,
        rng,
      );

      // Apply damage
      const newHp = Math.max(0, targetHealth.current - damage);
      world.setComponent(target, "Health", {
        current: newHp,
        max: targetHealth.max,
      });

      const targetDied = newHp <= 0;

      // Emit combat event
      if (eventQueue) {
        eventQueue.emit({
          type: "combat.damage",
          attacker,
          target,
          damage,
          actualDamage: damage,
          targetDied: newHp <= 0,
        });
      }

      // Handle death
      if (targetDied) {
        if (eventQueue) {
          eventQueue.emit({
            type: "entity.died",
            entity: target,
            killer: attacker,
          });
        }

        // Despawn target via command buffer
        world.commands.despawn(target);
      }

      // Remove attack request
      world.removeComponent(attacker, "AttackRequest");
    }
  });

/**
 * Action Resolution System
 *
 * Converts turn actions into game effects.
 * Listens to turn.action events and creates appropriate components.
 */
export const ActionResolutionSystem = defineSystem("ActionResolution")
  .inPhase(SystemPhase.Update)
  .runBefore("Combat")
  .runBefore("Collision")
  .execute((world: World) => {
    const eventQueue = world.resources.get<EventQueue>("eventQueue");
    if (!eventQueue) return;

    // Process action events from this tick
    // Note: In a full implementation, we'd process queued actions
    // For now, the action is handled via direct component manipulation
  });

/**
 * Creates an attack request for an entity.
 */
export function requestAttack(
  world: World,
  attacker: Entity,
  target: Entity,
): void {
  world.addComponent(attacker, "AttackRequest", { target });
}

/**
 * Applies movement from an action.
 */
export function applyMoveAction(
  world: World,
  entity: Entity,
  dx: number,
  dy: number,
): void {
  // Add velocity to trigger movement system
  world.addComponent(entity, "Velocity", { x: dx, y: dy });
}
