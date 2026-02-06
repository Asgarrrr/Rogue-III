/**
 * Zone Theming System
 *
 * Each zone has distinct visual and gameplay personality.
 * Main Theme: Medieval Fantasy / Abyss
 *
 * Themes define:
 * - Trait modifiers (dangerous, ancient, etc.)
 * - Preferred prefabs for the zone
 * - Spawn tags for entity generation
 * - Ambient atmosphere settings
 */

import type { SeededRandom } from "@rogue/contracts";
import type { Room } from "../../pipeline/types";

// =============================================================================
// ZONE THEME TYPES
// =============================================================================

/**
 * Light level for atmosphere
 */
export type LightLevel = "bright" | "dim" | "dark" | "pitch-black";

/**
 * Zone theme definition
 */
export interface ZoneTheme {
  /** Unique identifier */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** Description */
  readonly description: string;

  /** Trait modifiers (0.0 to 1.0) */
  readonly traitModifiers: Readonly<Record<string, number>>;

  /** Preferred prefab IDs for this zone */
  readonly preferredPrefabs: readonly string[];

  /** Entity spawn tags */
  readonly spawnTags: readonly string[];

  /** Light level */
  readonly lightLevel: LightLevel;

  /** Ambient atmosphere tags */
  readonly ambientTags: readonly string[];

  /** Depth range where this theme appears (0.0 = entrance, 1.0 = boss) */
  readonly depthRange: { min: number; max: number };

  /** Whether this is a natural/organic zone */
  readonly isNatural: boolean;
}

// =============================================================================
// ABYSS THEME DEFINITIONS
// =============================================================================

/**
 * Abyss-themed zone definitions for Medieval Fantasy
 */
export const ABYSS_THEMES: Readonly<Record<string, ZoneTheme>> = {
  // -------------------------------------------------------------------------
  // UPPER DEPTHS - Entry area
  // -------------------------------------------------------------------------
  upper_depths: {
    id: "upper_depths",
    name: "Upper Depths",
    description: "The entrance to the abyss, still touched by surface light",
    traitModifiers: {
      dangerous: 0.3,
      ancient: 0.5,
      mysterious: 0.4,
      cursed: 0.2,
    },
    preferredPrefabs: ["entrance-hall", "crossroads"],
    spawnTags: ["goblin", "rat", "weak", "scout"],
    lightLevel: "dim",
    ambientTags: ["dripping", "echo", "wind"],
    depthRange: { min: 0.0, max: 0.2 },
    isNatural: false,
  },

  // -------------------------------------------------------------------------
  // FORGOTTEN CATACOMBS - Undead zone
  // -------------------------------------------------------------------------
  catacombs: {
    id: "catacombs",
    name: "Forgotten Catacombs",
    description: "Ancient burial grounds where the dead do not rest",
    traitModifiers: {
      ancient: 0.9,
      cursed: 0.7,
      dangerous: 0.5,
      sacred: 0.3,
    },
    preferredPrefabs: ["crypt", "shrine"],
    spawnTags: ["undead", "skeleton", "ghost", "cursed"],
    lightLevel: "dark",
    ambientTags: ["whispers", "cold", "bones"],
    depthRange: { min: 0.2, max: 0.5 },
    isNatural: false,
  },

  // -------------------------------------------------------------------------
  // ABYSSAL CAVERNS - Natural caves
  // -------------------------------------------------------------------------
  caverns: {
    id: "caverns",
    name: "Abyssal Caverns",
    description: "Deep natural caves carved by ancient waters",
    traitModifiers: {
      natural: 1.0,
      dangerous: 0.6,
      mysterious: 0.8,
      claustrophobic: 0.5,
    },
    preferredPrefabs: ["cavern"],
    spawnTags: ["beast", "spider", "slime", "crawler"],
    lightLevel: "pitch-black",
    ambientTags: ["dripping", "echoes", "rumble", "wet"],
    depthRange: { min: 0.3, max: 0.7 },
    isNatural: true,
  },

  // -------------------------------------------------------------------------
  // SUNKEN FORTRESS - Constructed ruins
  // -------------------------------------------------------------------------
  fortress: {
    id: "fortress",
    name: "Sunken Fortress",
    description: "Remains of an ancient stronghold swallowed by the abyss",
    traitModifiers: {
      ancient: 0.7,
      wealthy: 0.4,
      dangerous: 0.7,
      mysterious: 0.3,
    },
    preferredPrefabs: ["forge", "library", "crossroads"],
    spawnTags: ["knight", "guard", "construct", "animated"],
    lightLevel: "dim",
    ambientTags: ["metal", "chains", "stone"],
    depthRange: { min: 0.4, max: 0.7 },
    isNatural: false,
  },

  // -------------------------------------------------------------------------
  // VOID SANCTUM - Boss domain
  // -------------------------------------------------------------------------
  sanctum: {
    id: "sanctum",
    name: "Void Sanctum",
    description: "The heart of the abyss where reality bends",
    traitModifiers: {
      cursed: 1.0,
      sacred: 0.6,
      dangerous: 1.0,
      mysterious: 0.9,
    },
    preferredPrefabs: ["boss-arena", "shrine", "throne-room"],
    spawnTags: ["demon", "void", "boss", "elite", "abyssal"],
    lightLevel: "dark",
    ambientTags: ["void_hum", "otherworldly", "pulsing"],
    depthRange: { min: 0.8, max: 1.0 },
    isNatural: false,
  },

  // -------------------------------------------------------------------------
  // HIDDEN TREASURY
  // -------------------------------------------------------------------------
  treasury: {
    id: "treasury",
    name: "Hidden Treasury",
    description: "Secret vaults filled with forgotten riches",
    traitModifiers: {
      wealthy: 1.0,
      ancient: 0.5,
      mysterious: 0.3,
      dangerous: 0.4,
    },
    preferredPrefabs: ["treasure-vault"],
    spawnTags: ["mimic", "guardian", "trap", "golden"],
    lightLevel: "bright",
    ambientTags: ["glitter", "gold", "coins"],
    depthRange: { min: 0.3, max: 0.8 },
    isNatural: false,
  },

  // -------------------------------------------------------------------------
  // ARCANE ARCHIVES
  // -------------------------------------------------------------------------
  archives: {
    id: "archives",
    name: "Arcane Archives",
    description: "Libraries of forbidden knowledge",
    traitModifiers: {
      mysterious: 1.0,
      ancient: 0.8,
      sacred: 0.4,
      dangerous: 0.5,
    },
    preferredPrefabs: ["library"],
    spawnTags: ["mage", "elemental", "book", "arcane"],
    lightLevel: "dim",
    ambientTags: ["pages", "magic_hum", "whispers"],
    depthRange: { min: 0.4, max: 0.7 },
    isNatural: false,
  },

  // -------------------------------------------------------------------------
  // CRYSTAL DEPTHS - Mystical zone
  // -------------------------------------------------------------------------
  crystal_depths: {
    id: "crystal_depths",
    name: "Crystal Depths",
    description: "Caves lined with glowing crystals of power",
    traitModifiers: {
      mysterious: 0.9,
      natural: 0.7,
      sacred: 0.5,
      wealthy: 0.3,
    },
    preferredPrefabs: ["cavern", "shrine"],
    spawnTags: ["elemental", "crystal", "golem", "spirit"],
    lightLevel: "dim",
    ambientTags: ["hum", "glow", "resonance"],
    depthRange: { min: 0.5, max: 0.8 },
    isNatural: true,
  },

  // -------------------------------------------------------------------------
  // FLOODED HALLS - Water zone
  // -------------------------------------------------------------------------
  flooded: {
    id: "flooded",
    name: "Flooded Halls",
    description: "Submerged corridors where darkness lurks beneath the surface",
    traitModifiers: {
      dangerous: 0.8,
      claustrophobic: 0.6,
      natural: 0.4,
      mysterious: 0.5,
    },
    preferredPrefabs: ["cavern"],
    spawnTags: ["aquatic", "lurker", "eel", "drowned"],
    lightLevel: "dark",
    ambientTags: ["water", "bubbles", "current"],
    depthRange: { min: 0.3, max: 0.6 },
    isNatural: true,
  },
};

// =============================================================================
// THEME ASSIGNMENT FUNCTIONS
// =============================================================================

/**
 * Get theme for a zone based on normalized depth
 */
export function getZoneThemeByDepth(
  normalizedDepth: number,
  isNaturalZone: boolean,
  rng: SeededRandom,
): ZoneTheme {
  // Filter themes by depth range and natural preference
  const eligibleThemes = Object.values(ABYSS_THEMES).filter((theme) => {
    const inRange =
      normalizedDepth >= theme.depthRange.min &&
      normalizedDepth <= theme.depthRange.max;
    const matchesNatural = isNaturalZone === theme.isNatural || !isNaturalZone;
    return inRange && matchesNatural;
  });

  if (eligibleThemes.length === 0) {
    // Fallback to upper_depths
    return ABYSS_THEMES.upper_depths!;
  }

  // Random selection from eligible themes
  const index = Math.floor(rng.next() * eligibleThemes.length);
  return eligibleThemes[index]!;
}

/**
 * Assign theme based on room position and purpose
 */
export function assignZoneTheme(
  room: Room,
  distance: number,
  maxDistance: number,
  rng: SeededRandom,
): ZoneTheme {
  const normalizedDepth = maxDistance > 0 ? distance / maxDistance : 0;

  // Special cases based on room type
  switch (room.type) {
    case "entrance":
      return ABYSS_THEMES.upper_depths!;
    case "boss":
      return ABYSS_THEMES.sanctum!;
    case "treasure":
      return ABYSS_THEMES.treasury!;
    case "library":
      return ABYSS_THEMES.archives!;
    case "armory":
      return ABYSS_THEMES.fortress!;
    case "cavern":
      return ABYSS_THEMES.caverns!;
  }

  // Default: assign by depth
  const isNatural =
    room.traits?.natural !== undefined && room.traits.natural > 0.5;
  return getZoneThemeByDepth(normalizedDepth, isNatural, rng);
}

// =============================================================================
// THEME APPLICATION
// =============================================================================

/**
 * Apply theme traits to a room
 */
export function applyThemeToRoom(
  room: Room,
  theme: ZoneTheme,
  rng: SeededRandom,
  blendFactor: number = 0.7,
): Room {
  const currentTraits = room.traits ?? {};
  const newTraits: Record<string, number> = { ...currentTraits };

  // Blend theme traits with existing traits
  for (const [trait, value] of Object.entries(theme.traitModifiers)) {
    const current = currentTraits[trait] ?? 0;
    // Weighted average: blendFactor for theme, (1-blendFactor) for existing
    const variance = (rng.next() - 0.5) * 0.2; // ±10% variance
    newTraits[trait] = current * (1 - blendFactor) + value * blendFactor + variance;
    // Clamp to 0-1
    newTraits[trait] = Math.max(0, Math.min(1, newTraits[trait]));
  }

  return {
    ...room,
    traits: newTraits,
  };
}

/**
 * Get spawn tags for a room based on its theme
 */
export function getThemedSpawnTags(room: Room, theme: ZoneTheme): string[] {
  const baseTags = [...theme.spawnTags];

  // Add tags based on room type
  if (room.type === "boss") {
    baseTags.push("boss", "elite");
  } else if (room.type === "treasure") {
    baseTags.push("guardian", "loot", "rare", "hidden");
  }

  return baseTags;
}

/**
 * Get ambient tags for atmosphere generation
 */
export function getAmbientTags(theme: ZoneTheme): string[] {
  return [...theme.ambientTags];
}

// =============================================================================
// THEME UTILITIES
// =============================================================================

/**
 * Get all available themes
 */
export function getAllThemes(): readonly ZoneTheme[] {
  return Object.values(ABYSS_THEMES);
}

/**
 * Get theme by ID
 */
export function getThemeById(id: string): ZoneTheme | undefined {
  return ABYSS_THEMES[id];
}

/**
 * Get themes for a specific depth range
 */
export function getThemesForDepth(
  normalizedDepth: number,
): readonly ZoneTheme[] {
  return Object.values(ABYSS_THEMES).filter(
    (theme) =>
      normalizedDepth >= theme.depthRange.min &&
      normalizedDepth <= theme.depthRange.max,
  );
}

/**
 * Check if a theme is natural/organic
 */
export function isNaturalTheme(theme: ZoneTheme): boolean {
  return theme.isNatural;
}

/**
 * Create a custom theme
 */
export function createCustomTheme(
  id: string,
  name: string,
  overrides: Partial<Omit<ZoneTheme, "id" | "name">>,
): ZoneTheme {
  const base: ZoneTheme = {
    id,
    name,
    description: overrides.description ?? "Custom zone theme",
    traitModifiers: overrides.traitModifiers ?? { dangerous: 0.5 },
    preferredPrefabs: overrides.preferredPrefabs ?? [],
    spawnTags: overrides.spawnTags ?? [],
    lightLevel: overrides.lightLevel ?? "dim",
    ambientTags: overrides.ambientTags ?? [],
    depthRange: overrides.depthRange ?? { min: 0, max: 1 },
    isNatural: overrides.isNatural ?? false,
  };

  return base;
}
