/**
 * Spatial Components
 *
 * Components for position, movement, and grid-based interactions.
 */

import { ComponentSchema, ComponentType } from "../../core/component";

/**
 * Layer constants for z-ordering.
 */
export const Layer = {
  FLOOR: 0,
  ITEM: 1,
  CREATURE: 2,
  EFFECT: 3,
} as const;

export type LayerType = (typeof Layer)[keyof typeof Layer];

/**
 * Position component - grid position with layer.
 */
export interface PositionData {
  x: number;
  y: number;
  layer: number;
}

export const PositionSchema = ComponentSchema.define<PositionData>("Position")
  .field("x", ComponentType.I32, 0)
  .field("y", ComponentType.I32, 0)
  .field("layer", ComponentType.U8, Layer.CREATURE)
  .build();

/**
 * Previous position for movement interpolation/history.
 */
export interface PreviousPositionData {
  x: number;
  y: number;
}

export const PreviousPositionSchema =
  ComponentSchema.define<PreviousPositionData>("PreviousPosition")
    .field("x", ComponentType.I32, 0)
    .field("y", ComponentType.I32, 0)
    .build();

/**
 * Velocity component for continuous movement.
 */
export interface VelocityData {
  x: number;
  y: number;
}

export const VelocitySchema = ComponentSchema.define<VelocityData>("Velocity")
  .field("x", ComponentType.F32, 0)
  .field("y", ComponentType.F32, 0)
  .build();

/**
 * Blocking component - entity blocks movement.
 */
export const BlocksMovementSchema =
  ComponentSchema.define<Record<string, never>>("BlocksMovement").build();

/**
 * Blocking component - entity blocks light/vision.
 */
export const BlocksVisionSchema =
  ComponentSchema.define<Record<string, never>>("BlocksVision").build();
