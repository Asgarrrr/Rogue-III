/**
 * Inventory and Interaction Systems Tests
 *
 * Tests for pickup, drop, equip, unequip, use item,
 * and interaction with doors, stairs, and containers.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { EventQueue } from "../../../src/game/ecs/core/events";
import { World } from "../../../src/game/ecs/core/world";
import { registerGameComponents } from "../../../src/game/ecs/game/components";
import { GameMap } from "../../../src/game/ecs/game/resources/game-map";
import { registerSystemComponents } from "../../../src/game/ecs/game/systems";
import {
  ContainerSystem,
  canInteract,
  DoorSystem,
  InteractionSystem,
  requestInteract,
  requestLootContainer,
  requestOpenDoor,
  requestUseStairs,
  StairsSystem,
} from "../../../src/game/ecs/game/systems/interaction";
import {
  DropSystem,
  EquipSystem,
  getEquippedItem,
  getInventoryCapacity,
  getInventoryItems,
  hasInventorySpace,
  PickupSystem,
  requestDrop,
  requestEquip,
  requestPickup,
  requestUnequip,
  requestUseItem,
  UnequipSystem,
  UseItemSystem,
} from "../../../src/game/ecs/game/systems/inventory";
import type { Entity } from "../../../src/game/ecs/types";
import { SystemPhase } from "../../../src/game/ecs/types";

describe("Inventory System", () => {
  let world: World;
  let eventQueue: EventQueue;
  let gameMap: GameMap;
  let player: Entity;

  beforeEach(() => {
    world = new World();
    eventQueue = new EventQueue();
    gameMap = new GameMap(20, 20);

    // Register components
    registerGameComponents(world);
    registerSystemComponents(world);

    // Register resources
    world.resources.register("eventQueue", eventQueue);
    world.resources.register("gameMap", gameMap);

    // Register systems
    world.systems.register(PickupSystem);
    world.systems.register(DropSystem);
    world.systems.register(EquipSystem);
    world.systems.register(UnequipSystem);
    world.systems.register(UseItemSystem);

    // Create player with inventory
    player = world.spawn();
    world.addComponent(player, "Position", { x: 5, y: 5, layer: 1 });
    world.addComponent(player, "Inventory", { items: [], capacity: 10 });
    world.addComponent(player, "Equipment", {
      weapon: 0,
      armor: 0,
      helmet: 0,
      accessory: 0,
    });
    world.addComponent(player, "Health", { current: 100, max: 100 });

    gameMap.addEntity(5, 5, player);
  });

  describe("PickupSystem", () => {
    test("should pick up item at player position", () => {
      // Create item on ground
      const item = world.spawn();
      world.addComponent(item, "Position", { x: 5, y: 5, layer: 0 });
      world.addComponent(item, "Item", {
        itemType: "consumable",
        stackable: false,
        count: 1,
        value: 10,
      });
      world.addComponent(item, "Pickupable", {});
      gameMap.addEntity(5, 5, item);

      // Request pickup
      requestPickup(world, player);

      // Run system
      world.systems.runPhase(SystemPhase.Update, world);
      world.commands.flush(world);

      // Verify item is in inventory
      const items = getInventoryItems(world, player);
      expect(items).toContain(item);

      // Verify item no longer has Position
      expect(world.hasComponent(item, "Position")).toBeFalse();

      // Verify InInventory component
      expect(world.hasComponent(item, "InInventory")).toBeTrue();
    });

    test("should pick up specific item by ID", () => {
      // Create two items
      const item1 = world.spawn();
      world.addComponent(item1, "Position", { x: 5, y: 5, layer: 0 });
      world.addComponent(item1, "Item", {
        itemType: "weapon",
        stackable: false,
        count: 1,
        value: 50,
      });
      world.addComponent(item1, "Pickupable", {});
      gameMap.addEntity(5, 5, item1);

      const item2 = world.spawn();
      world.addComponent(item2, "Position", { x: 5, y: 5, layer: 0 });
      world.addComponent(item2, "Item", {
        itemType: "armor",
        stackable: false,
        count: 1,
        value: 30,
      });
      world.addComponent(item2, "Pickupable", {});
      gameMap.addEntity(5, 5, item2);

      // Request pickup of specific item
      requestPickup(world, player, item2);

      world.systems.runPhase(SystemPhase.Update, world);
      world.commands.flush(world);

      const items = getInventoryItems(world, player);
      expect(items).toContain(item2);
      expect(items).not.toContain(item1);
    });

    test("should stack stackable items", () => {
      // Create stackable item in inventory
      const existingItem = world.spawn();
      world.addComponent(existingItem, "Item", {
        itemType: "consumable",
        stackable: true,
        count: 3,
        value: 5,
      });
      world.addComponent(existingItem, "InInventory", { owner: player });

      // Update inventory
      world.setComponent(player, "Inventory", {
        items: [existingItem],
        capacity: 10,
      });

      // Create same type item on ground
      const newItem = world.spawn();
      world.addComponent(newItem, "Position", { x: 5, y: 5, layer: 0 });
      world.addComponent(newItem, "Item", {
        itemType: "consumable",
        stackable: true,
        count: 2,
        value: 5,
      });
      world.addComponent(newItem, "Pickupable", {});
      gameMap.addEntity(5, 5, newItem);

      requestPickup(world, player);

      world.systems.runPhase(SystemPhase.Update, world);
      world.commands.flush(world);

      // Should have stacked
      const existingItemData = world.getComponent<{ count: number }>(
        existingItem,
        "Item",
      );
      expect(existingItemData?.count).toBe(5);

      // New item should be destroyed (merged into stack)
      expect(world.isAlive(newItem)).toBeFalse();
    });

    test("should not pick up when inventory is full", () => {
      // Fill inventory
      const filledItems: Entity[] = [];
      for (let i = 0; i < 10; i++) {
        const item = world.spawn();
        world.addComponent(item, "Item", {
          itemType: "misc",
          stackable: false,
          count: 1,
          value: 1,
        });
        world.addComponent(item, "InInventory", { owner: player });
        filledItems.push(item);
      }
      world.setComponent(player, "Inventory", {
        items: filledItems,
        capacity: 10,
      });

      // Create item on ground
      const newItem = world.spawn();
      world.addComponent(newItem, "Position", { x: 5, y: 5, layer: 0 });
      world.addComponent(newItem, "Item", {
        itemType: "weapon",
        stackable: false,
        count: 1,
        value: 100,
      });
      world.addComponent(newItem, "Pickupable", {});
      gameMap.addEntity(5, 5, newItem);

      requestPickup(world, player);

      world.systems.runPhase(SystemPhase.Update, world);
      world.commands.flush(world);

      // Item should still be on ground
      expect(world.hasComponent(newItem, "Position")).toBeTrue();
      expect(hasInventorySpace(world, player)).toBeFalse();
    });
  });

  describe("DropSystem", () => {
    test("should drop item from inventory", () => {
      // Add item to inventory
      const item = world.spawn();
      world.addComponent(item, "Item", {
        itemType: "weapon",
        stackable: false,
        count: 1,
        value: 50,
      });
      world.addComponent(item, "InInventory", { owner: player });
      world.setComponent(player, "Inventory", { items: [item], capacity: 10 });

      // Request drop
      requestDrop(world, player, item);

      world.systems.runPhase(SystemPhase.Update, world);
      world.commands.flush(world);

      // Verify item is no longer in inventory
      const items = getInventoryItems(world, player);
      expect(items).not.toContain(item);

      // Verify item has Position again
      expect(world.hasComponent(item, "Position")).toBeTrue();
      const pos = world.getComponent<{ x: number; y: number }>(
        item,
        "Position",
      );
      expect(pos?.x).toBe(5);
      expect(pos?.y).toBe(5);

      // Verify Pickupable is added back
      expect(world.hasComponent(item, "Pickupable")).toBeTrue();
    });

    test("should unequip item before dropping", () => {
      // Add and equip item
      const sword = world.spawn();
      world.addComponent(sword, "Item", {
        itemType: "weapon",
        stackable: false,
        count: 1,
        value: 50,
      });
      world.addComponent(sword, "Equippable", { slot: "weapon" });
      world.addComponent(sword, "InInventory", { owner: player });
      world.setComponent(player, "Inventory", { items: [sword], capacity: 10 });
      world.setComponent(player, "Equipment", {
        weapon: sword,
        armor: 0,
        helmet: 0,
        accessory: 0,
      });

      // Request drop
      requestDrop(world, player, sword);

      world.systems.runPhase(SystemPhase.Update, world);
      world.commands.flush(world);

      // Verify weapon slot is empty
      const equipped = getEquippedItem(world, player, "weapon");
      expect(equipped).toBeNull();
    });
  });

  describe("EquipSystem", () => {
    test("should equip item from inventory", () => {
      // Add equippable item to inventory
      const sword = world.spawn();
      world.addComponent(sword, "Item", {
        itemType: "weapon",
        stackable: false,
        count: 1,
        value: 50,
      });
      world.addComponent(sword, "Equippable", { slot: "weapon" });
      world.addComponent(sword, "InInventory", { owner: player });
      world.setComponent(player, "Inventory", { items: [sword], capacity: 10 });

      // Request equip
      requestEquip(world, player, sword);

      world.systems.runPhase(SystemPhase.Update, world);
      world.commands.flush(world);

      // Verify item is equipped
      const equipped = getEquippedItem(world, player, "weapon");
      expect(equipped).toBe(sword);
    });

    test("should swap equipment when slot is occupied", () => {
      // Equip first sword
      const sword1 = world.spawn();
      world.addComponent(sword1, "Item", {
        itemType: "weapon",
        stackable: false,
        count: 1,
        value: 50,
      });
      world.addComponent(sword1, "Equippable", { slot: "weapon" });
      world.addComponent(sword1, "InInventory", { owner: player });

      // Second sword
      const sword2 = world.spawn();
      world.addComponent(sword2, "Item", {
        itemType: "weapon",
        stackable: false,
        count: 1,
        value: 100,
      });
      world.addComponent(sword2, "Equippable", { slot: "weapon" });
      world.addComponent(sword2, "InInventory", { owner: player });

      world.setComponent(player, "Inventory", {
        items: [sword1, sword2],
        capacity: 10,
      });
      world.setComponent(player, "Equipment", {
        weapon: sword1,
        armor: 0,
        helmet: 0,
        accessory: 0,
      });

      // Equip second sword
      requestEquip(world, player, sword2);

      world.systems.runPhase(SystemPhase.Update, world);
      world.commands.flush(world);

      // Verify sword2 is now equipped
      const equipped = getEquippedItem(world, player, "weapon");
      expect(equipped).toBe(sword2);
    });
  });

  describe("UnequipSystem", () => {
    test("should unequip item from slot", () => {
      // Setup equipped item
      const sword = world.spawn();
      world.addComponent(sword, "Item", {
        itemType: "weapon",
        stackable: false,
        count: 1,
        value: 50,
      });
      world.addComponent(sword, "Equippable", { slot: "weapon" });
      world.addComponent(sword, "InInventory", { owner: player });
      world.setComponent(player, "Inventory", { items: [sword], capacity: 10 });
      world.setComponent(player, "Equipment", {
        weapon: sword,
        armor: 0,
        helmet: 0,
        accessory: 0,
      });

      // Request unequip
      requestUnequip(world, player, "weapon");

      world.systems.runPhase(SystemPhase.Update, world);
      world.commands.flush(world);

      // Verify weapon slot is empty
      const equipped = getEquippedItem(world, player, "weapon");
      expect(equipped).toBeNull();

      // Item should still be in inventory
      const items = getInventoryItems(world, player);
      expect(items).toContain(sword);
    });
  });

  describe("UseItemSystem", () => {
    test("should apply heal effect", () => {
      // Damage player
      world.setComponent(player, "Health", { current: 50, max: 100 });

      // Create health potion
      const potion = world.spawn();
      world.addComponent(potion, "Item", {
        itemType: "consumable",
        stackable: true,
        count: 1,
        value: 20,
      });
      world.addComponent(potion, "Consumable", {
        effectType: "heal",
        effectValue: 30,
        effectDuration: 0,
      });
      world.addComponent(potion, "InInventory", { owner: player });
      world.setComponent(player, "Inventory", {
        items: [potion],
        capacity: 10,
      });

      // Use potion
      requestUseItem(world, player, potion);

      world.systems.runPhase(SystemPhase.Update, world);
      world.commands.flush(world);

      // Verify health restored
      const health = world.getComponent<{ current: number; max: number }>(
        player,
        "Health",
      );
      expect(health?.current).toBe(80);

      // Potion should be consumed
      expect(world.isAlive(potion)).toBeFalse();
    });

    test("should decrement stack instead of destroying", () => {
      world.setComponent(player, "Health", { current: 50, max: 100 });

      // Create stack of potions
      const potions = world.spawn();
      world.addComponent(potions, "Item", {
        itemType: "consumable",
        stackable: true,
        count: 3,
        value: 20,
      });
      world.addComponent(potions, "Consumable", {
        effectType: "heal",
        effectValue: 20,
        effectDuration: 0,
      });
      world.addComponent(potions, "InInventory", { owner: player });
      world.setComponent(player, "Inventory", {
        items: [potions],
        capacity: 10,
      });

      requestUseItem(world, player, potions);

      world.systems.runPhase(SystemPhase.Update, world);
      world.commands.flush(world);

      // Potions should still exist with count - 1
      expect(world.isAlive(potions)).toBeTrue();
      const item = world.getComponent<{ count: number }>(potions, "Item");
      expect(item?.count).toBe(2);
    });
  });

  describe("Inventory Helpers", () => {
    test("getInventoryCapacity should return correct values", () => {
      const item1 = world.spawn();
      const item2 = world.spawn();
      world.setComponent(player, "Inventory", {
        items: [item1, item2],
        capacity: 10,
      });

      const capacity = getInventoryCapacity(world, player);
      expect(capacity.used).toBe(2);
      expect(capacity.total).toBe(10);
    });

    test("hasInventorySpace should return true when space available", () => {
      world.setComponent(player, "Inventory", { items: [], capacity: 10 });
      expect(hasInventorySpace(world, player)).toBeTrue();
    });

    test("hasInventorySpace should return false when full", () => {
      const items: Entity[] = [];
      for (let i = 0; i < 10; i++) {
        items.push(world.spawn());
      }
      world.setComponent(player, "Inventory", { items, capacity: 10 });
      expect(hasInventorySpace(world, player)).toBeFalse();
    });
  });
});

describe("Interaction System", () => {
  let world: World;
  let eventQueue: EventQueue;
  let gameMap: GameMap;
  let player: Entity;

  beforeEach(() => {
    world = new World();
    eventQueue = new EventQueue();
    gameMap = new GameMap(20, 20);

    registerGameComponents(world);
    registerSystemComponents(world);

    world.resources.register("eventQueue", eventQueue);
    world.resources.register("gameMap", gameMap);
    world.resources.register("currentLevel", 1);

    // Register systems
    world.systems.register(InteractionSystem);
    world.systems.register(DoorSystem);
    world.systems.register(StairsSystem);
    world.systems.register(ContainerSystem);

    // Create player
    player = world.spawn();
    world.addComponent(player, "Position", { x: 5, y: 5, layer: 1 });
    world.addComponent(player, "Inventory", { items: [], capacity: 10 });
    gameMap.addEntity(5, 5, player);
  });

  describe("DoorSystem", () => {
    test("should open closed door", () => {
      // Create door adjacent to player
      const door = world.spawn();
      world.addComponent(door, "Position", { x: 6, y: 5, layer: 1 });
      world.addComponent(door, "Door", {
        open: false,
        locked: false,
        keyId: "",
      });
      world.addComponent(door, "Blocking", { blocks: true });
      gameMap.addEntity(6, 5, door);

      // Request open door
      requestOpenDoor(world, player, door);

      world.systems.runPhase(SystemPhase.Update, world);
      world.commands.flush(world);

      // Verify door is open
      const doorData = world.getComponent<{ open: boolean }>(door, "Door");
      expect(doorData?.open).toBeTrue();

      // Verify blocking is updated (BlockingSchema uses U8: 0=false, 1=true)
      const blocking = world.getComponent<{ blocks: number }>(door, "Blocking");
      expect(blocking?.blocks).toBe(0);
    });

    test("should close open door", () => {
      const door = world.spawn();
      world.addComponent(door, "Position", { x: 6, y: 5, layer: 1 });
      world.addComponent(door, "Door", {
        open: true,
        locked: false,
        keyId: "",
      });
      world.addComponent(door, "Blocking", { blocks: false });
      gameMap.addEntity(6, 5, door);

      requestOpenDoor(world, player, door);

      world.systems.runPhase(SystemPhase.Update, world);
      world.commands.flush(world);

      const doorData = world.getComponent<{ open: boolean }>(door, "Door");
      expect(doorData?.open).toBeFalse();
    });

    test("should not open locked door without key", () => {
      const door = world.spawn();
      world.addComponent(door, "Position", { x: 6, y: 5, layer: 1 });
      world.addComponent(door, "Door", {
        open: false,
        locked: true,
        keyId: "gold_key",
      });
      world.addComponent(door, "Blocking", { blocks: true });
      gameMap.addEntity(6, 5, door);

      requestOpenDoor(world, player, door);

      world.systems.runPhase(SystemPhase.Update, world);
      world.commands.flush(world);

      // Door should remain closed
      const doorData = world.getComponent<{ open: boolean; locked: boolean }>(
        door,
        "Door",
      );
      expect(doorData?.open).toBeFalse();
      expect(doorData?.locked).toBeTrue();
    });

    test("should unlock and open door with correct key", () => {
      // Create key in inventory
      const key = world.spawn();
      world.addComponent(key, "Item", {
        itemType: "key",
        stackable: false,
        count: 1,
        value: 0,
      });
      world.addComponent(key, "Key", { keyId: "gold_key", consumeOnUse: true });
      world.addComponent(key, "InInventory", { owner: player });
      world.setComponent(player, "Inventory", { items: [key], capacity: 10 });

      // Create locked door
      const door = world.spawn();
      world.addComponent(door, "Position", { x: 6, y: 5, layer: 1 });
      world.addComponent(door, "Door", {
        open: false,
        locked: true,
        keyId: "gold_key",
      });
      world.addComponent(door, "Blocking", { blocks: true });
      gameMap.addEntity(6, 5, door);

      requestOpenDoor(world, player, door);

      world.systems.runPhase(SystemPhase.Update, world);
      world.commands.flush(world);

      // Door should be open and unlocked
      const doorData = world.getComponent<{ open: boolean; locked: boolean }>(
        door,
        "Door",
      );
      expect(doorData?.open).toBeTrue();
      expect(doorData?.locked).toBeFalse();

      // Key should be consumed
      expect(world.isAlive(key)).toBeFalse();
    });
  });

  describe("StairsSystem", () => {
    test("should emit level change event when using stairs", () => {
      // Create stairs at player position
      const stairs = world.spawn();
      world.addComponent(stairs, "Position", { x: 5, y: 5, layer: 0 });
      world.addComponent(stairs, "Stairs", {
        direction: "down",
        targetLevel: 2,
        targetX: 10,
        targetY: 10,
      });
      gameMap.addEntity(5, 5, stairs);

      let levelChangeEvent: { level: number; previousLevel: number } | null =
        null;
      eventQueue.on("level.changed", (e) => {
        levelChangeEvent = { level: e.level, previousLevel: e.previousLevel };
      });

      requestUseStairs(world, player, stairs);

      world.systems.runPhase(SystemPhase.Update, world);
      eventQueue.process();

      expect(levelChangeEvent).not.toBeNull();
      expect(levelChangeEvent?.level).toBe(2);
      expect(levelChangeEvent?.previousLevel).toBe(1);
    });

    test("should not use stairs if not at same position", () => {
      // Create stairs at different position
      const stairs = world.spawn();
      world.addComponent(stairs, "Position", { x: 10, y: 10, layer: 0 });
      world.addComponent(stairs, "Stairs", {
        direction: "down",
        targetLevel: 2,
        targetX: 5,
        targetY: 5,
      });
      gameMap.addEntity(10, 10, stairs);

      let levelChangeEvent = false;
      eventQueue.on("level.changed", () => {
        levelChangeEvent = true;
      });

      requestUseStairs(world, player, stairs);

      world.systems.runPhase(SystemPhase.Update, world);
      eventQueue.process();

      expect(levelChangeEvent).toBeFalse();
    });
  });

  describe("ContainerSystem", () => {
    test("should loot items from container", () => {
      // Create item in container
      const lootItem = world.spawn();
      world.addComponent(lootItem, "Item", {
        itemType: "treasure",
        stackable: false,
        count: 1,
        value: 100,
      });

      // Create container adjacent to player
      const chest = world.spawn();
      world.addComponent(chest, "Position", { x: 6, y: 5, layer: 0 });
      world.addComponent(chest, "Container", {
        items: [lootItem],
        locked: false,
        keyId: "",
        opened: false,
        lootTable: "",
      });
      gameMap.addEntity(6, 5, chest);

      requestLootContainer(world, player, chest);

      world.systems.runPhase(SystemPhase.Update, world);
      world.commands.flush(world);

      // Verify item is in player inventory
      const items = getInventoryItems(world, player);
      expect(items).toContain(lootItem);

      // Verify container is marked as opened
      const containerData = world.getComponent<{ opened: boolean }>(
        chest,
        "Container",
      );
      expect(containerData?.opened).toBeTrue();
    });

    test("should not loot locked container without key", () => {
      const lootItem = world.spawn();
      world.addComponent(lootItem, "Item", {
        itemType: "treasure",
        stackable: false,
        count: 1,
        value: 100,
      });

      const chest = world.spawn();
      world.addComponent(chest, "Position", { x: 6, y: 5, layer: 0 });
      world.addComponent(chest, "Container", {
        items: [lootItem],
        locked: true,
        keyId: "chest_key",
        opened: false,
        lootTable: "",
      });
      gameMap.addEntity(6, 5, chest);

      requestLootContainer(world, player, chest);

      world.systems.runPhase(SystemPhase.Update, world);
      world.commands.flush(world);

      // Container should still be locked
      const containerData = world.getComponent<{
        locked: boolean;
        opened: boolean;
      }>(chest, "Container");
      expect(containerData?.locked).toBeTrue();
      expect(containerData?.opened).toBeFalse();

      // Item should not be in inventory
      const items = getInventoryItems(world, player);
      expect(items).not.toContain(lootItem);
    });
  });

  describe("InteractionSystem (auto-detect)", () => {
    test("should auto-detect door and dispatch to DoorSystem", () => {
      const door = world.spawn();
      world.addComponent(door, "Position", { x: 6, y: 5, layer: 1 });
      world.addComponent(door, "Door", {
        open: false,
        locked: false,
        keyId: "",
      });
      world.addComponent(door, "Blocking", { blocks: true });
      gameMap.addEntity(6, 5, door);

      // Request generic interaction (direction 3 = East)
      requestInteract(world, player, 3);

      world.systems.runPhase(SystemPhase.Update, world);
      world.commands.flush(world);

      // Door should be opened
      const doorData = world.getComponent<{ open: boolean }>(door, "Door");
      expect(doorData?.open).toBeTrue();
    });
  });

  describe("canInteract helper", () => {
    test("should return true for adjacent unlocked door", () => {
      const door = world.spawn();
      world.addComponent(door, "Position", { x: 6, y: 5, layer: 1 });
      world.addComponent(door, "Door", {
        open: false,
        locked: false,
        keyId: "",
      });
      gameMap.addEntity(6, 5, door);

      const result = canInteract(world, player, door);
      expect(result.canInteract).toBeTrue();
    });

    test("should return false for locked door without key", () => {
      const door = world.spawn();
      world.addComponent(door, "Position", { x: 6, y: 5, layer: 1 });
      world.addComponent(door, "Door", {
        open: false,
        locked: true,
        keyId: "gold_key",
      });
      gameMap.addEntity(6, 5, door);

      const result = canInteract(world, player, door);
      expect(result.canInteract).toBeFalse();
      expect(result.reason).toContain("key");
    });

    test("should return false for distant target", () => {
      const door = world.spawn();
      world.addComponent(door, "Position", { x: 10, y: 10, layer: 1 });
      world.addComponent(door, "Door", {
        open: false,
        locked: false,
        keyId: "",
      });

      const result = canInteract(world, player, door);
      expect(result.canInteract).toBeFalse();
      expect(result.reason).toContain("far");
    });
  });
});
