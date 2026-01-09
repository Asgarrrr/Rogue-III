/**
 * Environment Entity Templates
 *
 * Templates for doors, stairs, traps, and other dungeon features.
 */

import { defineTemplate } from "../../features/templates";
import type { PositionData } from "../components/spatial";
import type { RenderableData } from "../components/render";
import type {
  DoorData,
  StairsData,
  TrapData,
  InteractableData,
} from "../components/environment";
import type { BlockingData } from "../systems/movement";

// ============================================================================
// Door Templates
// ============================================================================

export const DoorTemplate = defineTemplate("door")
  .tagged("environment", "door", "interactive")
  .with("Position", { x: 0, y: 0, layer: 1 } as PositionData)
  .with("Renderable", {
    glyph: "+",
    fgColor: "#8b4513",
    bgColor: "",
    zIndex: 2,
  } as RenderableData)
  .with("Door", {
    open: false,
    locked: false,
    keyId: "",
  } as DoorData)
  .with("Interactable", {
    interactionType: "open",
    message: "",
  } as InteractableData)
  .with("Blocking", { blocks: true } as BlockingData)
  .build();

export const LockedDoorTemplate = defineTemplate("door_locked")
  .extends("door")
  .tagged("locked")
  .with("Door", {
    open: false,
    locked: true,
    keyId: "default",
  } as DoorData)
  .build();

export const SecretDoorTemplate = defineTemplate("door_secret")
  .extends("door")
  .tagged("secret")
  .with("Renderable", {
    glyph: "#",
    fgColor: "#808080",
    bgColor: "",
    zIndex: 2,
  } as RenderableData)
  .build();

// ============================================================================
// Stairs Templates
// ============================================================================

export const StairsDownTemplate = defineTemplate("stairs_down")
  .tagged("environment", "stairs", "interactive")
  .with("Position", { x: 0, y: 0, layer: 0 } as PositionData)
  .with("Renderable", {
    glyph: ">",
    fgColor: "#ffffff",
    bgColor: "",
    zIndex: 0,
  } as RenderableData)
  .with("Stairs", {
    direction: "down",
    targetLevel: 1,
    targetX: 0,
    targetY: 0,
  } as StairsData)
  .with("Interactable", {
    interactionType: "activate",
    message: "",
  } as InteractableData)
  .build();

export const StairsUpTemplate = defineTemplate("stairs_up")
  .extends("stairs_down")
  .with("Renderable", {
    glyph: "<",
    fgColor: "#ffffff",
    bgColor: "",
    zIndex: 0,
  } as RenderableData)
  .with("Stairs", {
    direction: "up",
    targetLevel: 0,
    targetX: 0,
    targetY: 0,
  } as StairsData)
  .build();

// ============================================================================
// Trap Templates
// ============================================================================

export const SpikeTrapTemplate = defineTemplate("trap_spike")
  .tagged("environment", "trap", "dangerous")
  .with("Position", { x: 0, y: 0, layer: 0 } as PositionData)
  .with("Renderable", {
    glyph: "^",
    fgColor: "#808080",
    bgColor: "",
    zIndex: 0,
  } as RenderableData)
  .with("Trap", {
    trapType: "spike",
    damage: 10,
    triggered: false,
    visible: false,
    reusable: true,
  } as TrapData)
  .build();

export const ArrowTrapTemplate = defineTemplate("trap_arrow")
  .extends("trap_spike")
  .with("Trap", {
    trapType: "arrow",
    damage: 15,
    triggered: false,
    visible: false,
    reusable: false,
  } as TrapData)
  .build();

export const FireTrapTemplate = defineTemplate("trap_fire")
  .extends("trap_spike")
  .with("Renderable", {
    glyph: "^",
    fgColor: "#ff4500",
    bgColor: "",
    zIndex: 0,
  } as RenderableData)
  .with("Trap", {
    trapType: "spike",
    damage: 20,
    triggered: false,
    visible: false,
    reusable: true,
  } as TrapData)
  .build();

export const TeleportTrapTemplate = defineTemplate("trap_teleport")
  .extends("trap_spike")
  .with("Renderable", {
    glyph: "^",
    fgColor: "#ff00ff",
    bgColor: "",
    zIndex: 0,
  } as RenderableData)
  .with("Trap", {
    trapType: "teleport",
    damage: 0,
    triggered: false,
    visible: false,
    reusable: true,
  } as TrapData)
  .build();

// ============================================================================
// Container Templates
// ============================================================================

export const ChestTemplate = defineTemplate("chest")
  .tagged("environment", "container", "interactive")
  .with("Position", { x: 0, y: 0, layer: 1 } as PositionData)
  .with("Renderable", {
    glyph: "=",
    fgColor: "#8b4513",
    bgColor: "",
    zIndex: 1,
  } as RenderableData)
  .with("Interactable", {
    interactionType: "open",
    message: "",
  } as InteractableData)
  .build();

export const LockedChestTemplate = defineTemplate("chest_locked")
  .extends("chest")
  .tagged("locked")
  .build();

// ============================================================================
// Decoration Templates (non-interactive)
// ============================================================================

export const FountainTemplate = defineTemplate("fountain")
  .tagged("environment", "decoration")
  .with("Position", { x: 0, y: 0, layer: 1 } as PositionData)
  .with("Renderable", {
    glyph: "{",
    fgColor: "#00bfff",
    bgColor: "",
    zIndex: 1,
  } as RenderableData)
  .with("Blocking", { blocks: true } as BlockingData)
  .build();

export const StatueTemplate = defineTemplate("statue")
  .tagged("environment", "decoration")
  .with("Position", { x: 0, y: 0, layer: 1 } as PositionData)
  .with("Renderable", {
    glyph: "&",
    fgColor: "#808080",
    bgColor: "",
    zIndex: 1,
  } as RenderableData)
  .with("Blocking", { blocks: true } as BlockingData)
  .build();

export const PillarTemplate = defineTemplate("pillar")
  .tagged("environment", "decoration")
  .with("Position", { x: 0, y: 0, layer: 1 } as PositionData)
  .with("Renderable", {
    glyph: "O",
    fgColor: "#a0a0a0",
    bgColor: "",
    zIndex: 1,
  } as RenderableData)
  .with("Blocking", { blocks: true } as BlockingData)
  .build();

// ============================================================================
// All Environment Templates
// ============================================================================

export const ALL_ENVIRONMENT_TEMPLATES = [
  // Doors
  DoorTemplate,
  LockedDoorTemplate,
  SecretDoorTemplate,
  // Stairs
  StairsDownTemplate,
  StairsUpTemplate,
  // Traps
  SpikeTrapTemplate,
  ArrowTrapTemplate,
  FireTrapTemplate,
  TeleportTrapTemplate,
  // Containers
  ChestTemplate,
  LockedChestTemplate,
  // Decorations
  FountainTemplate,
  StatueTemplate,
  PillarTemplate,
];
