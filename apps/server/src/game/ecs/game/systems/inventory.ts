/**
 * Inventory System
 *
 * Handles item pickup, drop, equip/unequip, and use.
 * All inventory operations are request-based (add component, system processes).
 */

import { ComponentSchema, ComponentType } from "../../core/component";
import type { EventQueue } from "../../core/events";
import { defineSystem } from "../../core/system";
import type { World } from "../../core/world";
import type { Entity } from "../../types";
import { SystemPhase } from "../../types";
import type {
  ConsumableData,
  EquipmentData,
  EquipmentSlot,
  EquippableData,
  InventoryData,
  ItemData,
} from "../components/items";
import type { PositionData } from "../components/spatial";
import type { HealthData } from "../components/stats";
import type { GameMap } from "../resources/game-map";

// ============================================================================
// Request Components
// ============================================================================

/**
 * PickupRequest - Entity wants to pick up an item at their position.
 * If itemId is 0, picks up the first available item.
 */
export interface PickupRequestData {
  itemId: number; // Specific item entity ID, or 0 for any
}

export const PickupRequestSchema = ComponentSchema.define<PickupRequestData>(
  "PickupRequest",
)
  .field("itemId", ComponentType.U32, 0)
  .build();

/**
 * DropRequest - Entity wants to drop an item from inventory.
 */
export interface DropRequestData {
  itemId: number; // Item entity ID to drop
}

export const DropRequestSchema = ComponentSchema.define<DropRequestData>(
  "DropRequest",
)
  .field("itemId", ComponentType.U32, 0)
  .build();

/**
 * EquipRequest - Entity wants to equip an item.
 */
export interface EquipRequestData {
  itemId: number; // Item entity ID to equip
}

export const EquipRequestSchema = ComponentSchema.define<EquipRequestData>(
  "EquipRequest",
)
  .field("itemId", ComponentType.U32, 0)
  .build();

/**
 * UnequipRequest - Entity wants to unequip from a slot.
 */
export interface UnequipRequestData {
  slot: EquipmentSlot;
}

export const UnequipRequestSchema = ComponentSchema.define<UnequipRequestData>(
  "UnequipRequest",
)
  .field("slot", ComponentType.String, "weapon")
  .useAoS()
  .build();

/**
 * UseItemRequest - Entity wants to use an item (consumable).
 */
export interface UseItemRequestData {
  itemId: number; // Item entity ID to use
  targetId: number; // Target entity (0 = self)
}

export const UseItemRequestSchema = ComponentSchema.define<UseItemRequestData>(
  "UseItemRequest",
)
  .field("itemId", ComponentType.U32, 0)
  .field("targetId", ComponentType.U32, 0)
  .build();

// ============================================================================
// Pickup System
// ============================================================================

/**
 * Pickup System
 *
 * Processes PickupRequest components.
 * Finds items at the entity's position and adds them to inventory.
 */
export const PickupSystem = defineSystem("Pickup")
  .inPhase(SystemPhase.Update)
  .execute((world: World) => {
    const query = world.query({
      with: ["PickupRequest", "Position", "Inventory"],
      without: [],
    });
    const eventQueue = world.resources.get<EventQueue>("eventQueue");
    const gameMap = world.resources.get<GameMap>("gameMap");

    for (const entity of query.execute()) {
      const request = world.getComponent<PickupRequestData>(
        entity,
        "PickupRequest",
      );
      const pos = world.getComponent<PositionData>(entity, "Position");
      const inventory = world.getComponent<InventoryData>(entity, "Inventory");

      if (!request || !pos || !inventory) {
        world.removeComponent(entity, "PickupRequest");
        continue;
      }

      // Check inventory capacity
      if (inventory.items.length >= inventory.capacity) {
        // Inventory full - emit event and skip
        if (eventQueue) {
          eventQueue.emit({
            type: "item.dropped", // Reuse as "failed to pickup" indicator
            dropper: entity,
            item: request.itemId as Entity,
            x: pos.x,
            y: pos.y,
          });
        }
        world.removeComponent(entity, "PickupRequest");
        continue;
      }

      // Find items at position
      let itemToPickup: Entity | null = null;

      if (request.itemId !== 0) {
        // Specific item requested - verify it's at this position and pickupable
        const itemPos = world.getComponent<PositionData>(
          request.itemId as Entity,
          "Position",
        );
        const isPickupable = world.hasComponent(
          request.itemId as Entity,
          "Pickupable",
        );
        const isItem = world.hasComponent(request.itemId as Entity, "Item");

        if (
          itemPos &&
          isPickupable &&
          isItem &&
          itemPos.x === pos.x &&
          itemPos.y === pos.y
        ) {
          itemToPickup = request.itemId as Entity;
        }
      } else if (gameMap) {
        // Find any pickupable item at position
        const entitiesAtPos = gameMap.getEntitiesAt(pos.x, pos.y);
        for (const other of entitiesAtPos) {
          if (other === entity) continue;
          if (
            world.hasComponent(other, "Pickupable") &&
            world.hasComponent(other, "Item")
          ) {
            // Check not already in an inventory
            if (!world.hasComponent(other, "InInventory")) {
              itemToPickup = other;
              break;
            }
          }
        }
      }

      if (itemToPickup !== null) {
        // Get item data for stacking check
        const itemData = world.getComponent<ItemData>(itemToPickup, "Item");

        // Check for stackable items
        let stacked = false;
        if (itemData?.stackable) {
          // Find existing stack in inventory
          for (const existingItemId of inventory.items) {
            const existingItem = world.getComponent<ItemData>(
              existingItemId,
              "Item",
            );
            if (
              existingItem &&
              existingItem.itemType === itemData.itemType &&
              existingItem.stackable
            ) {
              // Add to existing stack
              world.setComponent(existingItemId, "Item", {
                ...existingItem,
                count: existingItem.count + itemData.count,
              });
              stacked = true;

              // Destroy the picked up item (it merged into stack)
              world.commands.despawn(itemToPickup);
              break;
            }
          }
        }

        if (!stacked) {
          // Add item to inventory
          const newItems = [...inventory.items, itemToPickup];
          world.setComponent(entity, "Inventory", {
            items: newItems,
            capacity: inventory.capacity,
          });

          // Mark item as in inventory
          world.addComponent(itemToPickup, "InInventory", { owner: entity });

          // Remove from world position (no longer on ground)
          world.removeComponent(itemToPickup, "Position");
          world.removeComponent(itemToPickup, "Pickupable");

          // Remove from spatial index
          if (gameMap) {
            const itemPos = world.getComponent<PositionData>(
              itemToPickup,
              "Position",
            );
            if (itemPos) {
              gameMap.removeEntity(itemPos.x, itemPos.y, itemToPickup);
            }
          }
        }

        // Emit pickup event
        if (eventQueue) {
          eventQueue.emit({
            type: "item.picked_up",
            picker: entity,
            item: itemToPickup,
            itemType: itemData?.itemType ?? "misc",
          });
        }
      }

      // Remove request
      world.removeComponent(entity, "PickupRequest");
    }
  });

// ============================================================================
// Drop System
// ============================================================================

/**
 * Drop System
 *
 * Processes DropRequest components.
 * Removes items from inventory and places them in the world.
 */
export const DropSystem = defineSystem("Drop")
  .inPhase(SystemPhase.Update)
  .execute((world: World) => {
    const query = world.query({
      with: ["DropRequest", "Position", "Inventory"],
      without: [],
    });
    const eventQueue = world.resources.get<EventQueue>("eventQueue");
    const gameMap = world.resources.get<GameMap>("gameMap");

    for (const entity of query.execute()) {
      const request = world.getComponent<DropRequestData>(
        entity,
        "DropRequest",
      );
      const pos = world.getComponent<PositionData>(entity, "Position");
      const inventory = world.getComponent<InventoryData>(entity, "Inventory");

      if (!request || !pos || !inventory || request.itemId === 0) {
        world.removeComponent(entity, "DropRequest");
        continue;
      }

      const itemId = request.itemId as Entity;

      // Verify item is in inventory
      const itemIndex = inventory.items.indexOf(itemId);
      if (itemIndex === -1) {
        world.removeComponent(entity, "DropRequest");
        continue;
      }

      // Check if item is equipped - unequip first
      const equipment = world.getComponent<EquipmentData>(entity, "Equipment");
      if (equipment) {
        let isEquipped = false;
        const slots: EquipmentSlot[] = [
          "weapon",
          "armor",
          "helmet",
          "accessory",
        ];
        for (const slot of slots) {
          if (equipment[slot] === itemId) {
            // Unequip item first
            world.setComponent(entity, "Equipment", {
              ...equipment,
              [slot]: 0,
            });
            isEquipped = true;
            break;
          }
        }

        if (isEquipped && eventQueue) {
          const equippable = world.getComponent<EquippableData>(
            itemId,
            "Equippable",
          );
          eventQueue.emit({
            type: "item.unequipped",
            entity,
            item: itemId,
            slot: equippable?.slot ?? "weapon",
          });
        }
      }

      // Remove from inventory
      const newItems = inventory.items.filter((id) => id !== itemId);
      world.setComponent(entity, "Inventory", {
        items: newItems,
        capacity: inventory.capacity,
      });

      // Remove InInventory component
      world.removeComponent(itemId, "InInventory");

      // Add position and pickupable back
      world.addComponent(itemId, "Position", {
        x: pos.x,
        y: pos.y,
        layer: 0, // Items on ground layer
      });
      world.addComponent(itemId, "Pickupable", {});

      // Add to spatial index
      if (gameMap) {
        gameMap.addEntity(pos.x, pos.y, itemId);
      }

      // Emit drop event
      if (eventQueue) {
        eventQueue.emit({
          type: "item.dropped",
          dropper: entity,
          item: itemId,
          x: pos.x,
          y: pos.y,
        });
      }

      // Remove request
      world.removeComponent(entity, "DropRequest");
    }
  });

// ============================================================================
// Equip System
// ============================================================================

/**
 * Equip System
 *
 * Processes EquipRequest components.
 * Equips items from inventory to equipment slots.
 */
export const EquipSystem = defineSystem("Equip")
  .inPhase(SystemPhase.Update)
  .execute((world: World) => {
    const query = world.query({
      with: ["EquipRequest", "Inventory", "Equipment"],
      without: [],
    });
    const eventQueue = world.resources.get<EventQueue>("eventQueue");

    for (const entity of query.execute()) {
      const request = world.getComponent<EquipRequestData>(
        entity,
        "EquipRequest",
      );
      const inventory = world.getComponent<InventoryData>(entity, "Inventory");
      const equipment = world.getComponent<EquipmentData>(entity, "Equipment");

      if (!request || !inventory || !equipment || request.itemId === 0) {
        world.removeComponent(entity, "EquipRequest");
        continue;
      }

      const itemId = request.itemId as Entity;

      // Verify item is in inventory
      if (!inventory.items.includes(itemId)) {
        world.removeComponent(entity, "EquipRequest");
        continue;
      }

      // Verify item is equippable
      const equippable = world.getComponent<EquippableData>(
        itemId,
        "Equippable",
      );
      if (!equippable) {
        world.removeComponent(entity, "EquipRequest");
        continue;
      }

      const slot = equippable.slot;
      const currentlyEquipped = equipment[slot] as Entity;

      // Unequip current item if any
      if (currentlyEquipped !== 0 && eventQueue) {
        eventQueue.emit({
          type: "item.unequipped",
          entity,
          item: currentlyEquipped,
          slot,
        });
      }

      // Equip new item
      world.setComponent(entity, "Equipment", {
        ...equipment,
        [slot]: itemId,
      });

      // Emit equip event
      if (eventQueue) {
        eventQueue.emit({
          type: "item.equipped",
          entity,
          item: itemId,
          slot,
        });
      }

      // Remove request
      world.removeComponent(entity, "EquipRequest");
    }
  });

// ============================================================================
// Unequip System
// ============================================================================

/**
 * Unequip System
 *
 * Processes UnequipRequest components.
 * Removes items from equipment slots (item stays in inventory).
 */
export const UnequipSystem = defineSystem("Unequip")
  .inPhase(SystemPhase.Update)
  .execute((world: World) => {
    const query = world.query({
      with: ["UnequipRequest", "Equipment"],
      without: [],
    });
    const eventQueue = world.resources.get<EventQueue>("eventQueue");

    for (const entity of query.execute()) {
      const request = world.getComponent<UnequipRequestData>(
        entity,
        "UnequipRequest",
      );
      const equipment = world.getComponent<EquipmentData>(entity, "Equipment");

      if (!request || !equipment) {
        world.removeComponent(entity, "UnequipRequest");
        continue;
      }

      const slot = request.slot;
      const equippedItem = equipment[slot] as Entity;

      if (equippedItem === 0) {
        // Nothing equipped in that slot
        world.removeComponent(entity, "UnequipRequest");
        continue;
      }

      // Unequip
      world.setComponent(entity, "Equipment", {
        ...equipment,
        [slot]: 0,
      });

      // Emit event
      if (eventQueue) {
        eventQueue.emit({
          type: "item.unequipped",
          entity,
          item: equippedItem,
          slot,
        });
      }

      // Remove request
      world.removeComponent(entity, "UnequipRequest");
    }
  });

// ============================================================================
// Use Item System
// ============================================================================

/**
 * Use Item System
 *
 * Processes UseItemRequest components.
 * Applies consumable effects and removes/decrements items.
 */
export const UseItemSystem = defineSystem("UseItem")
  .inPhase(SystemPhase.Update)
  .execute((world: World) => {
    const query = world.query({
      with: ["UseItemRequest", "Inventory"],
      without: [],
    });
    const eventQueue = world.resources.get<EventQueue>("eventQueue");

    for (const entity of query.execute()) {
      const request = world.getComponent<UseItemRequestData>(
        entity,
        "UseItemRequest",
      );
      const inventory = world.getComponent<InventoryData>(entity, "Inventory");

      if (!request || !inventory || request.itemId === 0) {
        world.removeComponent(entity, "UseItemRequest");
        continue;
      }

      const itemId = request.itemId as Entity;
      const targetId =
        request.targetId === 0 ? entity : (request.targetId as Entity);

      // Verify item is in inventory
      if (!inventory.items.includes(itemId)) {
        world.removeComponent(entity, "UseItemRequest");
        continue;
      }

      // Get consumable data
      const consumable = world.getComponent<ConsumableData>(
        itemId,
        "Consumable",
      );
      if (!consumable) {
        // Not a usable item
        world.removeComponent(entity, "UseItemRequest");
        continue;
      }

      // Apply effect based on type
      let effectApplied = false;

      switch (consumable.effectType) {
        case "heal": {
          const health = world.getComponent<HealthData>(targetId, "Health");
          if (health) {
            const newHp = Math.min(
              health.max,
              health.current + consumable.effectValue,
            );
            world.setComponent(targetId, "Health", {
              current: newHp,
              max: health.max,
            });
            effectApplied = true;
          }
          break;
        }

        case "damage": {
          const health = world.getComponent<HealthData>(targetId, "Health");
          if (health) {
            const newHp = Math.max(0, health.current - consumable.effectValue);
            world.setComponent(targetId, "Health", {
              current: newHp,
              max: health.max,
            });
            effectApplied = true;

            // Check for death
            if (newHp <= 0 && eventQueue) {
              eventQueue.emit({
                type: "entity.died",
                entity: targetId,
                killer: entity,
              });
              world.commands.despawn(targetId);
            }
          }
          break;
        }

        case "buff":
        case "debuff": {
          // Apply status effect
          if (eventQueue) {
            eventQueue.emit({
              type: "status.applied",
              entity: targetId,
              status: consumable.effectType,
              duration: consumable.effectDuration,
            });
          }
          effectApplied = true;
          break;
        }

        case "teleport": {
          // Teleport handled by separate system
          // Just emit event for now
          if (eventQueue) {
            eventQueue.emit({
              type: "status.applied",
              entity: targetId,
              status: "teleport",
              duration: 0,
            });
          }
          effectApplied = true;
          break;
        }
      }

      if (effectApplied) {
        // Emit use event
        if (eventQueue) {
          eventQueue.emit({
            type: "item.used",
            user: entity,
            item: itemId,
            effect: consumable.effectType,
          });
        }

        // Decrement or remove item
        const item = world.getComponent<ItemData>(itemId, "Item");
        if (item && item.stackable && item.count > 1) {
          // Decrement stack
          world.setComponent(itemId, "Item", {
            ...item,
            count: item.count - 1,
          });
        } else {
          // Remove from inventory
          const newItems = inventory.items.filter((id) => id !== itemId);
          world.setComponent(entity, "Inventory", {
            items: newItems,
            capacity: inventory.capacity,
          });

          // Destroy item
          world.commands.despawn(itemId);
        }
      }

      // Remove request
      world.removeComponent(entity, "UseItemRequest");
    }
  });

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Request to pick up an item.
 * @param world - The ECS world
 * @param entity - Entity that wants to pick up
 * @param itemId - Specific item to pick up (0 for any at position)
 */
export function requestPickup(
  world: World,
  entity: Entity,
  itemId: Entity | 0 = 0,
): void {
  world.addComponent(entity, "PickupRequest", { itemId });
}

/**
 * Request to drop an item.
 * @param world - The ECS world
 * @param entity - Entity dropping the item
 * @param itemId - Item to drop
 */
export function requestDrop(
  world: World,
  entity: Entity,
  itemId: Entity,
): void {
  world.addComponent(entity, "DropRequest", { itemId });
}

/**
 * Request to equip an item.
 * @param world - The ECS world
 * @param entity - Entity equipping
 * @param itemId - Item to equip
 */
export function requestEquip(
  world: World,
  entity: Entity,
  itemId: Entity,
): void {
  world.addComponent(entity, "EquipRequest", { itemId });
}

/**
 * Request to unequip from a slot.
 * @param world - The ECS world
 * @param entity - Entity unequipping
 * @param slot - Slot to unequip
 */
export function requestUnequip(
  world: World,
  entity: Entity,
  slot: EquipmentSlot,
): void {
  world.addComponent(entity, "UnequipRequest", { slot });
}

/**
 * Request to use an item.
 * @param world - The ECS world
 * @param entity - Entity using the item
 * @param itemId - Item to use
 * @param targetId - Target entity (0 for self)
 */
export function requestUseItem(
  world: World,
  entity: Entity,
  itemId: Entity,
  targetId: Entity | 0 = 0,
): void {
  world.addComponent(entity, "UseItemRequest", { itemId, targetId });
}

/**
 * Gets all items in an entity's inventory.
 */
export function getInventoryItems(world: World, entity: Entity): Entity[] {
  const inventory = world.getComponent<InventoryData>(entity, "Inventory");
  return inventory?.items ?? [];
}

/**
 * Gets the item equipped in a slot.
 */
export function getEquippedItem(
  world: World,
  entity: Entity,
  slot: EquipmentSlot,
): Entity | null {
  const equipment = world.getComponent<EquipmentData>(entity, "Equipment");
  if (!equipment) return null;
  const itemId = equipment[slot];
  return itemId !== 0 ? (itemId as Entity) : null;
}

/**
 * Checks if inventory has space.
 */
export function hasInventorySpace(world: World, entity: Entity): boolean {
  const inventory = world.getComponent<InventoryData>(entity, "Inventory");
  if (!inventory) return false;
  return inventory.items.length < inventory.capacity;
}

/**
 * Gets remaining inventory capacity.
 */
export function getInventoryCapacity(
  world: World,
  entity: Entity,
): { used: number; total: number } {
  const inventory = world.getComponent<InventoryData>(entity, "Inventory");
  if (!inventory) return { used: 0, total: 0 };
  return { used: inventory.items.length, total: inventory.capacity };
}
