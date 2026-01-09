/**
 * Movement System
 *
 * Handles grid-based movement for entities with Position and Velocity.
 * Works with CollisionSystem which should run before to validate moves.
 */

import { SystemPhase } from "../../types";
import { defineSystem } from "../../core/system";
import type { World } from "../../core/world";
import type { EventQueue } from "../../core/events";
import type { PositionData, VelocityData } from "../components/spatial";
import type { GameMap } from "../resources/game-map";

/**
 * Movement System
 *
 * Applies velocity to position and resets velocity after movement.
 * Emits entity.moved event for each moved entity.
 */
export const MovementSystem = defineSystem("Movement")
  .inPhase(SystemPhase.Update)
  .execute((world: World) => {
    const query = world.query({ with: ["Position", "Velocity"], without: [] });
    const eventQueue = world.resources.get<EventQueue>("eventQueue");
    const gameMap = world.resources.get<GameMap>("gameMap");

    for (const entity of query.execute()) {
      const pos = world.getComponent<PositionData>(entity, "Position");
      const vel = world.getComponent<VelocityData>(entity, "Velocity");

      if (!pos || !vel) continue;

      // Skip if no movement
      if (vel.x === 0 && vel.y === 0) continue;

      const oldX = pos.x;
      const oldY = pos.y;

      // Calculate new position
      const newX = pos.x + vel.x;
      const newY = pos.y + vel.y;

      // Update position
      world.setComponent(entity, "Position", {
        x: newX,
        y: newY,
        layer: pos.layer,
      });

      // Update GameMap spatial index
      if (gameMap) {
        gameMap.moveEntity(entity, oldX, oldY, newX, newY);
      }

      // Reset velocity after movement (turn-based)
      world.setComponent(entity, "Velocity", { x: 0, y: 0 });

      // Emit movement event
      if (eventQueue) {
        eventQueue.emit({
          type: "entity.moved",
          entity,
          fromX: oldX,
          fromY: oldY,
          toX: newX,
          toY: newY,
        });
      }
    }
  });

/**
 * Collision System
 *
 * Validates movement before it happens.
 * Cancels velocity if the destination is blocked.
 * Runs before MovementSystem.
 */
export const CollisionSystem = defineSystem("Collision")
  .inPhase(SystemPhase.Update)
  .runBefore("Movement")
  .execute((world: World) => {
    const gameMap = world.resources.get<GameMap>("gameMap");
    if (!gameMap) return;

    const query = world.query({ with: ["Position", "Velocity"], without: [] });

    for (const entity of query.execute()) {
      const pos = world.getComponent<PositionData>(entity, "Position");
      const vel = world.getComponent<VelocityData>(entity, "Velocity");

      if (!pos || !vel) continue;

      // Skip if no movement intent
      if (vel.x === 0 && vel.y === 0) continue;

      const newX = Math.floor(pos.x + vel.x);
      const newY = Math.floor(pos.y + vel.y);

      // Check bounds
      if (!gameMap.isInBounds(newX, newY)) {
        world.setComponent(entity, "Velocity", { x: 0, y: 0 });
        continue;
      }

      // Check if tile is walkable
      if (!gameMap.isWalkable(newX, newY)) {
        world.setComponent(entity, "Velocity", { x: 0, y: 0 });
        continue;
      }

      // Check for blocking entities at destination
      const entitiesAtPos = gameMap.getEntitiesAt(newX, newY);
      let blocked = false;

      for (const other of entitiesAtPos) {
        if (other === entity) continue;

        // Check if entity has Blocking component
        const blocking = world.getComponent<{ blocks: boolean }>(
          other,
          "Blocking",
        );
        if (blocking?.blocks) {
          blocked = true;
          break;
        }
      }

      if (blocked) {
        world.setComponent(entity, "Velocity", { x: 0, y: 0 });
      }
    }
  });

/**
 * Blocking Component Schema
 *
 * Add to entities that block movement (enemies, closed doors, etc.)
 */
import { ComponentSchema, ComponentType } from "../../core/component";

export interface BlockingData {
  blocks: boolean;
}

export const BlockingSchema = ComponentSchema.define<BlockingData>("Blocking")
  .field("blocks", ComponentType.U8, 1) // 1 = true, 0 = false
  .build();
