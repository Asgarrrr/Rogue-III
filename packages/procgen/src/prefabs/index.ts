/**
 * Room Prefabs Module
 *
 * Exports room templates and utilities for non-rectangular room shapes.
 */

// Predefined Shapes
export {
  ALL_TEMPLATES,
  // All templates
  BASE_TEMPLATES,
  CORRIDOR_ROOM,
  CROSS_BASE,
  CROSS_LARGE,
  CROSS_VARIANTS,
  DIAMOND,
  getTemplatesByTag,
  // Helper functions
  getTemplatesForRoomType,
  // Base templates
  L_SHAPE_BASE,
  L_SHAPE_LARGE,
  // Variant collections
  L_SHAPE_VARIANTS,
  LARGE_TEMPLATES,
  PLUS_BASE,
  SMALL_TEMPLATES,
  T_SHAPE_BASE,
  T_SHAPE_LARGE,
  T_SHAPE_VARIANTS,
} from "./shapes";
// Utilities
export {
  createTemplate,
  generateAllRotations,
  generateAllVariants,
  getTemplateAbsoluteCells,
  getTemplateArea,
  getTemplateCenter,
  mirrorTemplate,
  rotateTemplate,
  scaleTemplate,
  selectTemplateForLeaf,
  templateFitsInBounds,
} from "./template-utils";
// Types
export type {
  RoomTemplate,
  TemplateCell,
  TemplateSelectionConfig,
  TemplateShape,
  TemplateVariant,
} from "./types";
export { DEFAULT_TEMPLATE_SELECTION } from "./types";

// Signature Rooms (Boss Arena, Treasure Vault, etc.)
export {
  BOSS_ARENA,
  CAVERN,
  CROSSROADS,
  CRYPT,
  ENTRANCE_HALL,
  FORGE,
  getSignaturePrefab,
  getSignaturePrefabsByTag,
  getSignaturePrefabsForType,
  LIBRARY,
  SHRINE,
  SIGNATURE_PREFABS,
  SIGNATURE_PREFABS_MAP,
  THRONE_ROOM,
  TREASURE_VAULT,
} from "./signature-rooms";
