/**
 * Room Traits Pass Module
 *
 * Assigns personality traits to rooms based on type, characteristics,
 * and neighbor propagation.
 */

// Main pass
export {
  type AssignRoomTraitsConfig,
  assignRoomTraits,
  createAssignRoomTraitsPass,
  DEFAULT_TRAITS_CONFIG,
} from "./assign-room-traits";

// Profiles and modifiers
export {
  applyModifiers,
  getProfileForRoomType,
  ROOM_TRAIT_DIMENSIONS,
  ROOM_TYPE_PROFILES,
  type RoomModifierContext,
  type RoomTraitDimension,
  STANDARD_MODIFIERS,
  type TraitModifier,
} from "./profiles";

// Zone Themes (Abyss / Medieval Fantasy)
export type { LightLevel, ZoneTheme } from "./zone-themes";
export {
  ABYSS_THEMES,
  applyThemeToRoom,
  assignZoneTheme,
  createCustomTheme,
  getAllThemes,
  getAmbientTags,
  getThemeById,
  getThemesForDepth,
  getThemedSpawnTags,
  getZoneThemeByDepth,
  isNaturalTheme,
} from "./zone-themes";
