/**
 * Room Template Types
 *
 * Type definitions for non-rectangular room shapes.
 * Templates define patterns of floor cells for varied room designs.
 */

import type { RoomType } from "../pipeline/types";

/**
 * A cell offset relative to anchor point
 */
export interface TemplateCell {
  readonly dx: number; // X offset from anchor
  readonly dy: number; // Y offset from anchor
}

/**
 * Shape classification for templates
 */
export type TemplateShape =
  | "rectangle"
  | "l-shape"
  | "t-shape"
  | "cross"
  | "plus"
  | "custom";

/**
 * A room template definition
 */
export interface RoomTemplate {
  /** Unique template identifier */
  readonly id: string;
  /** Shape classification */
  readonly shape: TemplateShape;
  /** Floor cells relative to anchor point */
  readonly cells: readonly TemplateCell[];
  /** Bounding box width */
  readonly width: number;
  /** Bounding box height */
  readonly height: number;
  /** Anchor X position in bounding box (0 = left) */
  readonly anchorX: number;
  /** Anchor Y position in bounding box (0 = top) */
  readonly anchorY: number;
  /** Minimum BSP leaf size to fit this template */
  readonly minLeafSize: number;
  /** Compatible room types (if undefined, compatible with all) */
  readonly compatibleTypes?: readonly RoomType[];
  /** Tags for filtering and selection */
  readonly tags?: readonly string[];
}

/**
 * Template variant with transformation
 */
export interface TemplateVariant {
  readonly template: RoomTemplate;
  readonly rotation: 0 | 90 | 180 | 270;
  readonly mirrored: boolean;
}

/**
 * Configuration for template selection
 */
export interface TemplateSelectionConfig {
  /** Probability of using a template vs rectangle (0-1) */
  readonly templateChance: number;
  /** Minimum leaf size to consider templates */
  readonly minLeafSize: number;
  /** Filter by room type */
  readonly roomType?: RoomType;
  /** Filter by tags */
  readonly requiredTags?: readonly string[];
}

/**
 * Default template selection config
 */
export const DEFAULT_TEMPLATE_SELECTION: TemplateSelectionConfig = {
  templateChance: 0.3,
  minLeafSize: 8,
};
