/**
 * Turn Components
 *
 * Components for the turn-based energy system.
 */

import { ComponentSchema, ComponentType } from "../../core/component";

/**
 * Energy required to take a turn.
 */
export const ENERGY_THRESHOLD = 100;

/**
 * Turn energy component - determines when entity can act.
 */
export interface TurnEnergyData {
  energy: number;
  energyPerTurn: number;
  speed: number; // Speed modifier (100 = normal)
}

export const TurnEnergySchema = ComponentSchema.define<TurnEnergyData>(
  "TurnEnergy",
)
  .field("energy", ComponentType.I32, 0)
  .field("energyPerTurn", ComponentType.I32, 100)
  .field("speed", ComponentType.I32, 100)
  .build();

/**
 * Active turn tag - marks the entity currently taking a turn.
 */
export const ActiveTurnSchema =
  ComponentSchema.define<Record<string, never>>("ActiveTurn").build();

/**
 * Waiting for input tag - entity needs player input.
 */
export const WaitingForInputSchema =
  ComponentSchema.define<Record<string, never>>("WaitingForInput").build();

/**
 * Action submitted component - holds the action to execute.
 */
export interface ActionData {
  actionType: ActionType;
  targetX?: number;
  targetY?: number;
  targetEntity?: number;
  itemId?: number;
}

export type ActionType =
  | "move"
  | "attack"
  | "wait"
  | "pickup"
  | "drop"
  | "use"
  | "interact";

export const ActionSchema = ComponentSchema.define<ActionData>("Action")
  .field("actionType", ComponentType.String, "wait")
  .field("targetX", ComponentType.I32, 0)
  .field("targetY", ComponentType.I32, 0)
  .field("targetEntity", ComponentType.U32, 0)
  .field("itemId", ComponentType.U32, 0)
  .useAoS()
  .build();
