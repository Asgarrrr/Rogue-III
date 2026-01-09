/**
 * Render Components
 *
 * Components for visual representation.
 */

import { ComponentSchema, ComponentType } from "../../core/component";

/**
 * Renderable component for ASCII/tile display.
 */
export interface RenderableData {
  glyph: string; // ASCII character or sprite ID
  fgColor: string; // Foreground color (hex)
  bgColor: string; // Background color (hex or empty)
  zIndex: number; // Render order within layer
}

export const RenderableSchema = ComponentSchema.define<RenderableData>(
  "Renderable",
)
  .field("glyph", ComponentType.String, "?")
  .field("fgColor", ComponentType.String, "#ffffff")
  .field("bgColor", ComponentType.String, "")
  .field("zIndex", ComponentType.I32, 0)
  .useAoS()
  .build();

/**
 * Description component for examine/look.
 */
export interface DescriptionData {
  short: string;
  long: string;
}

export const DescriptionSchema = ComponentSchema.define<DescriptionData>(
  "Description",
)
  .field("short", ComponentType.String, "Something")
  .field("long", ComponentType.String, "You see something.")
  .useAoS()
  .build();

/**
 * Animation state.
 */
export interface AnimationData {
  animationType: AnimationType;
  frame: number;
  frameCount: number;
  frameDuration: number;
  elapsed: number;
  loop: boolean;
}

export type AnimationType = "idle" | "walk" | "attack" | "hurt" | "die";

export const AnimationSchema = ComponentSchema.define<AnimationData>(
  "Animation",
)
  .field("animationType", ComponentType.String, "idle")
  .field("frame", ComponentType.U8, 0)
  .field("frameCount", ComponentType.U8, 1)
  .field("frameDuration", ComponentType.U16, 200)
  .field("elapsed", ComponentType.U16, 0)
  .field("loop", ComponentType.U8, 1)
  .useAoS()
  .build();
