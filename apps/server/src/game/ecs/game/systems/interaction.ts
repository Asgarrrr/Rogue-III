/**
 * Interaction System
 *
 * Handles interactions with environment objects: doors, stairs, containers.
 * All interactions are request-based (add component, system processes).
 */

import { ComponentSchema, ComponentType } from "../../core/component";
import type { EventQueue, GameEvent } from "../../core/events";
import { defineSystem } from "../../core/system";
import type { World } from "../../core/world";
import type { Entity } from "../../types";
import { SystemPhase } from "../../types";
import type {
  ContainerData,
  DoorData,
  InteractableData,
  KeyData,
  StairsData,
} from "../components/environment";
import type { InventoryData, ItemData } from "../components/items";
import type { PositionData } from "../components/spatial";
import type { GameMap } from "../resources/game-map";

// ============================================================================
// Request Components
// ============================================================================

/**
 * InteractRequest - Entity wants to interact with something.
 * If targetId is 0, interacts with adjacent/current position.
 */
export interface InteractRequestData {
  targetId: number; // Target entity ID, or 0 for auto-detect
  direction: number; // 0-8 (0=here, 1-8=directions) for directional interaction
}

export const InteractRequestSchema =
  ComponentSchema.define<InteractRequestData>("InteractRequest")
    .field("targetId", ComponentType.U32, 0)
    .field("direction", ComponentType.U8, 0)
    .build();

/**
 * OpenDoorRequest - Entity wants to open/close a specific door.
 */
export interface OpenDoorRequestData {
  doorId: number;
}

export const OpenDoorRequestSchema =
  ComponentSchema.define<OpenDoorRequestData>("OpenDoorRequest")
    .field("doorId", ComponentType.U32, 0)
    .build();

/**
 * UseStairsRequest - Entity wants to use stairs.
 */
export interface UseStairsRequestData {
  stairsId: number;
}

export const UseStairsRequestSchema =
  ComponentSchema.define<UseStairsRequestData>("UseStairs")
    .field("stairsId", ComponentType.U32, 0)
    .build();

/**
 * LootContainerRequest - Entity wants to loot a container.
 */
export interface LootContainerRequestData {
  containerId: number;
}

export const LootContainerRequestSchema =
  ComponentSchema.define<LootContainerRequestData>("LootContainer")
    .field("containerId", ComponentType.U32, 0)
    .build();

// ============================================================================
// Direction Helpers
// ============================================================================

/**
 * Direction offsets: 0=here, 1=N, 2=NE, 3=E, 4=SE, 5=S, 6=SW, 7=W, 8=NW
 */
const DIRECTION_OFFSETS: readonly { dx: number; dy: number }[] = [
  { dx: 0, dy: 0 }, // 0: here
  { dx: 0, dy: -1 }, // 1: N
  { dx: 1, dy: -1 }, // 2: NE
  { dx: 1, dy: 0 }, // 3: E
  { dx: 1, dy: 1 }, // 4: SE
  { dx: 0, dy: 1 }, // 5: S
  { dx: -1, dy: 1 }, // 6: SW
  { dx: -1, dy: 0 }, // 7: W
  { dx: -1, dy: -1 }, // 8: NW
];

/**
 * Gets the position offset for a direction.
 */
function getDirectionOffset(direction: number): { dx: number; dy: number } {
  return DIRECTION_OFFSETS[direction] ?? { dx: 0, dy: 0 };
}

// ============================================================================
// Door Interaction System
// ============================================================================

/**
 * Door System
 *
 * Processes OpenDoorRequest components.
 * Opens/closes doors, handles locked doors and keys.
 */
export const DoorSystem = defineSystem("Door")
  .inPhase(SystemPhase.Update)
  .execute((world: World) => {
    const query = world.query({ with: ["OpenDoorRequest"], without: [] });
    const eventQueue = world.resources.get<EventQueue>("eventQueue");
    const gameMap = world.resources.get<GameMap>("gameMap");

    for (const entity of query.execute()) {
      const request = world.getComponent<OpenDoorRequestData>(
        entity,
        "OpenDoorRequest",
      );

      if (!request || request.doorId === 0) {
        world.removeComponent(entity, "OpenDoorRequest");
        continue;
      }

      const doorId = request.doorId as Entity;

      // Verify door exists and has Door component
      if (!world.isAlive(doorId) || !world.hasComponent(doorId, "Door")) {
        world.removeComponent(entity, "OpenDoorRequest");
        continue;
      }

      const door = world.getComponent<DoorData>(doorId, "Door");
      if (!door) {
        world.removeComponent(entity, "OpenDoorRequest");
        continue;
      }

      // Check if door is locked
      if (door.locked && !door.open) {
        // Try to find key in inventory
        const inventory = world.getComponent<InventoryData>(
          entity,
          "Inventory",
        );
        let hasKey = false;
        let keyItemId: Entity | null = null;

        if (inventory && door.keyId) {
          for (const itemId of inventory.items) {
            const key = world.getComponent<KeyData>(itemId as Entity, "Key");
            if (key && key.keyId === door.keyId) {
              hasKey = true;
              keyItemId = itemId as Entity;
              break;
            }
          }
        }

        if (!hasKey) {
          // Door is locked and we don't have key
          // Emit "door locked" message event
          if (eventQueue) {
            // Using a status event as a message proxy
            eventQueue.emit({
              type: "status.applied",
              entity,
              status: "door_locked",
              duration: 0,
            });
          }
          world.removeComponent(entity, "OpenDoorRequest");
          continue;
        }

        // Unlock door with key
        world.setComponent(doorId, "Door", {
          ...door,
          locked: false,
        });

        // Consume key if needed
        if (keyItemId !== null) {
          const key = world.getComponent<KeyData>(keyItemId, "Key");
          if (key?.consumeOnUse && inventory) {
            // Remove key from inventory
            const newItems = inventory.items.filter((id) => id !== keyItemId);
            world.setComponent(entity, "Inventory", {
              items: newItems,
              capacity: inventory.capacity,
            });
            world.commands.despawn(keyItemId);
          }
        }
      }

      // Toggle door state
      const newOpen = !door.open;

      world.setComponent(doorId, "Door", {
        ...door,
        open: newOpen,
        locked: false, // Unlocks when opened
      });

      // Update blocking state
      if (world.hasComponent(doorId, "Blocking")) {
        world.setComponent(doorId, "Blocking", { blocks: !newOpen });
      }

      // Update GameMap tile type if needed
      if (gameMap) {
        const doorPos = world.getComponent<PositionData>(doorId, "Position");
        if (doorPos) {
          // Update walkability - open doors are walkable
          // This is handled by the Blocking component check in CollisionSystem
        }
      }

      // Emit door event
      if (eventQueue) {
        if (newOpen) {
          eventQueue.emit({
            type: "door.opened",
            entity,
            door: doorId,
          });
        } else {
          eventQueue.emit({
            type: "door.closed",
            entity,
            door: doorId,
          });
        }
      }

      // Remove request
      world.removeComponent(entity, "OpenDoorRequest");
    }
  });

// ============================================================================
// Stairs System
// ============================================================================

/**
 * Stairs System
 *
 * Processes UseStairsRequest components.
 * Triggers level transition events.
 */
export const StairsSystem = defineSystem("Stairs")
  .inPhase(SystemPhase.Update)
  .execute((world: World) => {
    const query = world.query({ with: ["UseStairs", "Position"], without: [] });
    const eventQueue = world.resources.get<EventQueue>("eventQueue");

    for (const entity of query.execute()) {
      const request = world.getComponent<UseStairsRequestData>(
        entity,
        "UseStairs",
      );
      const entityPos = world.getComponent<PositionData>(entity, "Position");

      if (!request || request.stairsId === 0 || !entityPos) {
        world.removeComponent(entity, "UseStairs");
        continue;
      }

      const stairsId = request.stairsId as Entity;

      // Verify stairs exist
      if (!world.isAlive(stairsId) || !world.hasComponent(stairsId, "Stairs")) {
        world.removeComponent(entity, "UseStairs");
        continue;
      }

      const stairs = world.getComponent<StairsData>(stairsId, "Stairs");
      const stairsPos = world.getComponent<PositionData>(stairsId, "Position");

      if (!stairs || !stairsPos) {
        world.removeComponent(entity, "UseStairs");
        continue;
      }

      // Verify entity is at stairs position
      if (entityPos.x !== stairsPos.x || entityPos.y !== stairsPos.y) {
        world.removeComponent(entity, "UseStairs");
        continue;
      }

      // Get current level
      const currentLevel = world.resources.get<number>("currentLevel") ?? 1;
      const newLevel = stairs.targetLevel;

      // Emit level change event
      if (eventQueue) {
        eventQueue.emit({
          type: "level.changed",
          level: newLevel,
          previousLevel: currentLevel,
        });
      }

      // Update current level resource
      world.resources.set("currentLevel", newLevel);

      // Note: Actual level loading is handled by external code listening to the event
      // The event handler should:
      // 1. Clear current dungeon entities
      // 2. Generate/load new level
      // 3. Position player at target coordinates (stairs.targetX, stairs.targetY)

      // Remove request
      world.removeComponent(entity, "UseStairs");
    }
  });

// ============================================================================
// Container System
// ============================================================================

/**
 * Container System
 *
 * Processes LootContainerRequest components.
 * Opens containers and transfers items to entity's inventory.
 */
export const ContainerSystem = defineSystem("Container")
  .inPhase(SystemPhase.Update)
  .execute((world: World) => {
    const query = world.query({
      with: ["LootContainer", "Inventory", "Position"],
      without: [],
    });
    const eventQueue = world.resources.get<EventQueue>("eventQueue");
    const gameMap = world.resources.get<GameMap>("gameMap");

    for (const entity of query.execute()) {
      const request = world.getComponent<LootContainerRequestData>(
        entity,
        "LootContainer",
      );
      const inventory = world.getComponent<InventoryData>(entity, "Inventory");
      const entityPos = world.getComponent<PositionData>(entity, "Position");

      if (!request || request.containerId === 0 || !inventory || !entityPos) {
        world.removeComponent(entity, "LootContainer");
        continue;
      }

      const containerId = request.containerId as Entity;

      // Verify container exists
      if (
        !world.isAlive(containerId) ||
        !world.hasComponent(containerId, "Container")
      ) {
        world.removeComponent(entity, "LootContainer");
        continue;
      }

      const container = world.getComponent<ContainerData>(
        containerId,
        "Container",
      );
      const containerPos = world.getComponent<PositionData>(
        containerId,
        "Position",
      );

      if (!container || !containerPos) {
        world.removeComponent(entity, "LootContainer");
        continue;
      }

      // Check if entity is adjacent to container (distance <= 1)
      const dx = Math.abs(entityPos.x - containerPos.x);
      const dy = Math.abs(entityPos.y - containerPos.y);
      if (dx > 1 || dy > 1) {
        world.removeComponent(entity, "LootContainer");
        continue;
      }

      // Check if container is locked
      if (container.locked && !container.opened) {
        // Try to find key
        let hasKey = false;
        let keyItemId: Entity | null = null;

        if (container.keyId) {
          for (const itemId of inventory.items) {
            const key = world.getComponent<KeyData>(itemId as Entity, "Key");
            if (key && key.keyId === container.keyId) {
              hasKey = true;
              keyItemId = itemId as Entity;
              break;
            }
          }
        }

        if (!hasKey) {
          // Container is locked
          if (eventQueue) {
            eventQueue.emit({
              type: "status.applied",
              entity,
              status: "container_locked",
              duration: 0,
            });
          }
          world.removeComponent(entity, "LootContainer");
          continue;
        }

        // Unlock with key
        world.setComponent(containerId, "Container", {
          ...container,
          locked: false,
        });

        // Consume key if needed
        if (keyItemId !== null) {
          const key = world.getComponent<KeyData>(keyItemId, "Key");
          if (key?.consumeOnUse) {
            const newItems = inventory.items.filter((id) => id !== keyItemId);
            world.setComponent(entity, "Inventory", {
              items: newItems,
              capacity: inventory.capacity,
            });
            world.commands.despawn(keyItemId);
          }
        }
      }

      // Mark container as opened
      if (!container.opened) {
        world.setComponent(containerId, "Container", {
          ...container,
          opened: true,
          locked: false,
        });

        // Update renderable if container has one (visual change)
        const renderable = world.getComponent<{ sprite: string }>(
          containerId,
          "Renderable",
        );
        if (renderable && renderable.sprite.includes("chest")) {
          world.setComponent(containerId, "Renderable", {
            ...renderable,
            sprite: renderable.sprite.replace("closed", "open"),
          });
        }
      }

      // Transfer items to inventory
      const containerItems = [...container.items];
      const availableSpace = inventory.capacity - inventory.items.length;

      let itemsLooted = 0;
      const lootedItems: Entity[] = [];

      for (const itemId of containerItems) {
        if (itemsLooted >= availableSpace) {
          // Inventory full - drop remaining items on ground
          if (gameMap) {
            world.addComponent(itemId as Entity, "Position", {
              x: containerPos.x,
              y: containerPos.y,
              layer: 0,
            });
            world.addComponent(itemId as Entity, "Pickupable", {});
            gameMap.addEntity(containerPos.x, containerPos.y, itemId as Entity);
          }
          continue;
        }

        // Add to inventory
        world.addComponent(itemId as Entity, "InInventory", { owner: entity });
        lootedItems.push(itemId as Entity);
        itemsLooted++;

        // Emit pickup event for each item
        if (eventQueue) {
          const item = world.getComponent<ItemData>(itemId as Entity, "Item");
          eventQueue.emit({
            type: "item.picked_up",
            picker: entity,
            item: itemId as Entity,
            itemType: item?.itemType ?? "misc",
          });
        }
      }

      // Update inventory
      if (lootedItems.length > 0) {
        world.setComponent(entity, "Inventory", {
          items: [...inventory.items, ...lootedItems],
          capacity: inventory.capacity,
        });
      }

      // Clear container items
      world.setComponent(containerId, "Container", {
        ...world.getComponent<ContainerData>(containerId, "Container")!,
        items: container.items.filter(
          (id) => !lootedItems.includes(id as Entity),
        ),
      });

      // Remove request
      world.removeComponent(entity, "LootContainer");
    }
  });

// ============================================================================
// General Interaction System
// ============================================================================

/**
 * Interaction System
 *
 * Processes InteractRequest components.
 * Auto-detects what to interact with and dispatches to specific systems.
 */
export const InteractionSystem = defineSystem("Interaction")
  .inPhase(SystemPhase.Update)
  .runBefore("Door")
  .runBefore("Stairs")
  .runBefore("Container")
  .execute((world: World) => {
    const query = world.query({
      with: ["InteractRequest", "Position"],
      without: [],
    });
    const gameMap = world.resources.get<GameMap>("gameMap");

    for (const entity of query.execute()) {
      const request = world.getComponent<InteractRequestData>(
        entity,
        "InteractRequest",
      );
      const pos = world.getComponent<PositionData>(entity, "Position");

      if (!request || !pos) {
        world.removeComponent(entity, "InteractRequest");
        continue;
      }

      // Determine target position based on direction
      const offset = getDirectionOffset(request.direction);
      const targetX = pos.x + offset.dx;
      const targetY = pos.y + offset.dy;

      let targetEntity: Entity | null = null;

      if (request.targetId !== 0) {
        // Specific target
        targetEntity = request.targetId as Entity;
      } else if (gameMap) {
        // Auto-detect interactable at target position
        const entitiesAtPos = gameMap.getEntitiesAt(targetX, targetY);

        for (const other of entitiesAtPos) {
          if (other === entity) continue;

          // Check for interactable components in priority order
          if (world.hasComponent(other, "Door")) {
            targetEntity = other;
            break;
          }
          if (world.hasComponent(other, "Stairs")) {
            targetEntity = other;
            break;
          }
          if (world.hasComponent(other, "Container")) {
            targetEntity = other;
            break;
          }
          if (world.hasComponent(other, "Interactable")) {
            targetEntity = other;
            break;
          }
        }
      }

      if (targetEntity !== null) {
        // Dispatch to appropriate system based on component
        if (world.hasComponent(targetEntity, "Door")) {
          world.addComponent(entity, "OpenDoorRequest", {
            doorId: targetEntity,
          });
        } else if (world.hasComponent(targetEntity, "Stairs")) {
          world.addComponent(entity, "UseStairs", { stairsId: targetEntity });
        } else if (world.hasComponent(targetEntity, "Container")) {
          world.addComponent(entity, "LootContainer", {
            containerId: targetEntity,
          });
        } else if (world.hasComponent(targetEntity, "Interactable")) {
          // Generic interactable - emit event
          const interactable = world.getComponent<InteractableData>(
            targetEntity,
            "Interactable",
          );
          const eventQueue = world.resources.get<EventQueue>("eventQueue");

          if (interactable && eventQueue) {
            // Use status.applied as generic message event
            eventQueue.emit({
              type: "status.applied",
              entity,
              status: `interact_${interactable.interactionType}`,
              duration: 0,
            });
          }
        }
      }

      // Remove request
      world.removeComponent(entity, "InteractRequest");
    }
  });

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Request to interact with something at a direction.
 * @param world - The ECS world
 * @param entity - Entity that wants to interact
 * @param direction - Direction (0=here, 1-8=cardinal/diagonal)
 */
export function requestInteract(
  world: World,
  entity: Entity,
  direction: number = 0,
): void {
  world.addComponent(entity, "InteractRequest", { targetId: 0, direction });
}

/**
 * Request to interact with a specific target.
 * @param world - The ECS world
 * @param entity - Entity that wants to interact
 * @param targetId - Target entity
 */
export function requestInteractWith(
  world: World,
  entity: Entity,
  targetId: Entity,
): void {
  world.addComponent(entity, "InteractRequest", { targetId, direction: 0 });
}

/**
 * Request to open/close a door.
 * @param world - The ECS world
 * @param entity - Entity opening the door
 * @param doorId - Door entity
 */
export function requestOpenDoor(
  world: World,
  entity: Entity,
  doorId: Entity,
): void {
  world.addComponent(entity, "OpenDoorRequest", { doorId });
}

/**
 * Request to use stairs.
 * @param world - The ECS world
 * @param entity - Entity using stairs
 * @param stairsId - Stairs entity
 */
export function requestUseStairs(
  world: World,
  entity: Entity,
  stairsId: Entity,
): void {
  world.addComponent(entity, "UseStairs", { stairsId });
}

/**
 * Request to loot a container.
 * @param world - The ECS world
 * @param entity - Entity looting
 * @param containerId - Container entity
 */
export function requestLootContainer(
  world: World,
  entity: Entity,
  containerId: Entity,
): void {
  world.addComponent(entity, "LootContainer", { containerId });
}

/**
 * Finds the nearest interactable entity to a position.
 */
export function findNearestInteractable(
  world: World,
  gameMap: GameMap,
  x: number,
  y: number,
  maxDistance: number = 1,
): Entity | null {
  for (let dist = 0; dist <= maxDistance; dist++) {
    for (let dy = -dist; dy <= dist; dy++) {
      for (let dx = -dist; dx <= dist; dx++) {
        if (Math.abs(dx) !== dist && Math.abs(dy) !== dist) continue;

        const entitiesAtPos = gameMap.getEntitiesAt(x + dx, y + dy);
        for (const entity of entitiesAtPos) {
          if (
            world.hasComponent(entity, "Door") ||
            world.hasComponent(entity, "Stairs") ||
            world.hasComponent(entity, "Container") ||
            world.hasComponent(entity, "Interactable")
          ) {
            return entity;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Checks if an entity can interact with a target.
 */
export function canInteract(
  world: World,
  entity: Entity,
  targetId: Entity,
): { canInteract: boolean; reason?: string } {
  const entityPos = world.getComponent<PositionData>(entity, "Position");
  const targetPos = world.getComponent<PositionData>(targetId, "Position");

  if (!entityPos || !targetPos) {
    return { canInteract: false, reason: "Missing position" };
  }

  const dx = Math.abs(entityPos.x - targetPos.x);
  const dy = Math.abs(entityPos.y - targetPos.y);

  if (dx > 1 || dy > 1) {
    return { canInteract: false, reason: "Too far away" };
  }

  // Check if locked
  const door = world.getComponent<DoorData>(targetId, "Door");
  if (door?.locked) {
    const inventory = world.getComponent<InventoryData>(entity, "Inventory");
    const hasKey = inventory?.items.some((itemId) => {
      const key = world.getComponent<KeyData>(itemId as Entity, "Key");
      return key?.keyId === door.keyId;
    });
    if (!hasKey) {
      return { canInteract: false, reason: "Locked - need key" };
    }
  }

  const container = world.getComponent<ContainerData>(targetId, "Container");
  if (container?.locked && !container.opened) {
    const inventory = world.getComponent<InventoryData>(entity, "Inventory");
    const hasKey = inventory?.items.some((itemId) => {
      const key = world.getComponent<KeyData>(itemId as Entity, "Key");
      return key?.keyId === container.keyId;
    });
    if (!hasKey) {
      return { canInteract: false, reason: "Locked - need key" };
    }
  }

  return { canInteract: true };
}
