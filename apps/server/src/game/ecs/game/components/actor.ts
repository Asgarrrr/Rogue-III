/**
 * Actor Components
 *
 * Components for player, AI, and entity identity.
 */

import { ComponentSchema, ComponentType } from "../../core/component";
import type { Entity } from "../../types";

/**
 * Player tag - marks the player entity.
 */
export const PlayerSchema =
  ComponentSchema.define<Record<string, never>>("Player").build();

/**
 * AI state machine.
 */
export type AIState =
  | "idle"
  | "patrol"
  | "chase"
  | "attack"
  | "flee"
  | "wander";

export interface AIData {
  state: AIState;
  target: number; // Entity ID or 0 for none
  alertness: number; // 0-100, affects detection
  homeX: number;
  homeY: number;
  patrolRadius: number;
}

export const AISchema = ComponentSchema.define<AIData>("AI")
  .field("state", ComponentType.String, "idle")
  .field("target", ComponentType.U32, 0)
  .field("alertness", ComponentType.U8, 50)
  .field("homeX", ComponentType.I32, 0)
  .field("homeY", ComponentType.I32, 0)
  .field("patrolRadius", ComponentType.U8, 5)
  .useAoS()
  .build();

/**
 * Faction component for friend/foe determination.
 */
export type FactionType = "player" | "monster" | "neutral" | "ally";

export interface FactionData {
  faction: FactionType;
}

export const FactionSchema = ComponentSchema.define<FactionData>("Faction")
  .field("faction", ComponentType.String, "neutral")
  .useAoS()
  .build();

/**
 * Name component for display.
 */
export interface ActorNameData {
  name: string;
  title?: string;
}

export const ActorNameSchema = ComponentSchema.define<ActorNameData>(
  "ActorName",
)
  .field("name", ComponentType.String, "Unknown")
  .field("title", ComponentType.String, "")
  .useAoS()
  .build();
