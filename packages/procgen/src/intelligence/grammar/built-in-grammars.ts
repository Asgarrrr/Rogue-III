/**
 * Built-in Grammars
 *
 * Pre-defined grammar patterns for common dungeon experiences.
 */

import type {
  ExperienceNodeType,
  Grammar,
  GrammarConstraints,
  GrammarProduction,
  GrammarSymbol,
} from "./types";
import { DEFAULT_GRAMMAR_CONSTRAINTS } from "./types";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a terminal symbol.
 */
function terminal(
  name: ExperienceNodeType,
  repetition: GrammarSymbol["repetition"] = "once",
  minRepeatOrTags?: number | readonly string[],
  maxRepeat?: number,
): GrammarSymbol {
  // Handle overloaded signature
  if (typeof minRepeatOrTags === "number") {
    return {
      name,
      terminal: true,
      repetition,
      minRepeat: minRepeatOrTags,
      maxRepeat,
      tags: [],
    };
  }
  return {
    name,
    terminal: true,
    repetition,
    tags: minRepeatOrTags ?? [],
  };
}

/**
 * Create a non-terminal symbol.
 */
function nonTerminal(
  name: string,
  repetition: GrammarSymbol["repetition"] = "once",
  minRepeat?: number,
  maxRepeat?: number,
): GrammarSymbol {
  return { name, terminal: false, repetition, minRepeat, maxRepeat };
}

/**
 * Create a production rule.
 */
function production(
  symbol: string,
  ...replacements: Array<{
    symbols: GrammarSymbol[];
    weight?: number;
    condition?: GrammarProduction["replacements"][0]["condition"];
  }>
): GrammarProduction {
  return {
    symbol,
    replacements: replacements.map((r) => ({
      symbols: r.symbols,
      weight: r.weight ?? 1,
      condition: r.condition,
    })),
  };
}

/**
 * Default tags for node types.
 */
const DEFAULT_TAGS: Record<ExperienceNodeType, readonly string[]> = {
  entrance: ["safe", "spawn"],
  combat: ["danger", "encounter"],
  puzzle: ["challenge", "mental"],
  treasure: ["reward", "loot"],
  rest: ["safe", "healing"],
  story: ["narrative", "lore"],
  shop: ["safe", "merchant"],
  miniboss: ["danger", "encounter", "miniboss"],
  boss: ["danger", "encounter", "boss", "climax"],
  exit: ["goal", "completion"],
  secret: ["optional", "hidden", "reward"],
  shortcut: ["traversal", "convenience"],
};

// =============================================================================
// CLASSIC DUNGEON GRAMMAR
// =============================================================================

/**
 * Classic linear dungeon with combat, treasure, and a boss.
 *
 * Pattern:
 *   dungeon := entrance → exploration+ → boss_area → exit
 *   exploration := (combat | treasure | rest)
 *   boss_area := combat → boss → treasure
 */
export const CLASSIC_GRAMMAR: Grammar = {
  id: "classic",
  name: "Classic Dungeon",
  description: "Linear progression with combat encounters leading to a boss fight",

  startSymbol: "dungeon",

  productions: [
    // Main structure
    production("dungeon", {
      symbols: [
        terminal("entrance"),
        nonTerminal("exploration", "oneOrMore", 2, 5),
        nonTerminal("boss_area"),
        terminal("exit"),
      ],
    }),

    // Exploration segments
    production(
      "exploration",
      { symbols: [nonTerminal("combat_segment")], weight: 3 },
      { symbols: [nonTerminal("treasure_segment")], weight: 2 },
      { symbols: [nonTerminal("rest_segment")], weight: 1 },
    ),

    // Combat segment
    production(
      "combat_segment",
      { symbols: [terminal("combat")] },
      { symbols: [terminal("combat"), terminal("combat")], weight: 0.5 },
    ),

    // Treasure segment
    production(
      "treasure_segment",
      { symbols: [terminal("treasure")] },
      { symbols: [terminal("combat"), terminal("treasure")], weight: 0.7 },
    ),

    // Rest segment
    production("rest_segment", { symbols: [terminal("rest")] }),

    // Boss area
    production("boss_area", {
      symbols: [
        terminal("combat", "optional"),
        terminal("boss"),
        terminal("treasure"),
      ],
    }),
  ],

  defaultTags: DEFAULT_TAGS,

  constraints: {
    ...DEFAULT_GRAMMAR_CONSTRAINTS,
    minNodes: 6,
    maxNodes: 15,
    minCombat: 3,
    maxCombat: 8,
    requireBoss: true,
  },
};

// =============================================================================
// METROIDVANIA GRAMMAR
// =============================================================================

/**
 * Metroidvania-style dungeon with keys, locks, and backtracking.
 *
 * Pattern:
 *   dungeon := entrance → zone+ → final_zone → exit
 *   zone := exploration+ → key_room → locked_path
 *   exploration := combat | puzzle | treasure
 */
export const METROIDVANIA_GRAMMAR: Grammar = {
  id: "metroidvania",
  name: "Metroidvania",
  description: "Non-linear exploration with keys, locks, and ability gates",

  startSymbol: "dungeon",

  productions: [
    // Main structure
    production("dungeon", {
      symbols: [
        terminal("entrance"),
        nonTerminal("zone", "oneOrMore", 2, 3),
        nonTerminal("final_zone"),
        terminal("exit"),
      ],
    }),

    // Zone with key and lock
    production("zone", {
      symbols: [
        nonTerminal("exploration", "oneOrMore", 1, 3),
        nonTerminal("key_room"),
        nonTerminal("locked_area", "optional"),
      ],
    }),

    // Key room (guarded treasure)
    production(
      "key_room",
      { symbols: [terminal("combat"), terminal("treasure", "once", ["key"])] },
      { symbols: [terminal("puzzle"), terminal("treasure", "once", ["key"])] },
    ),

    // Locked area (requires previous key)
    production("locked_area", {
      symbols: [
        terminal("combat", "optional"),
        terminal("treasure"),
        terminal("secret", "optional"),
      ],
    }),

    // Exploration options
    production(
      "exploration",
      { symbols: [terminal("combat")], weight: 3 },
      { symbols: [terminal("puzzle")], weight: 2 },
      { symbols: [terminal("treasure")], weight: 1 },
      { symbols: [terminal("story")], weight: 0.5 },
    ),

    // Final zone with boss
    production("final_zone", {
      symbols: [
        terminal("combat"),
        terminal("rest"),
        terminal("miniboss", "optional"),
        terminal("boss"),
        terminal("treasure"),
      ],
    }),
  ],

  defaultTags: {
    ...DEFAULT_TAGS,
    treasure: ["reward", "loot", "may-have-key"],
  },

  constraints: {
    ...DEFAULT_GRAMMAR_CONSTRAINTS,
    minNodes: 10,
    maxNodes: 25,
    minCombat: 4,
    maxCombat: 12,
    minTreasure: 3,
    requireBoss: true,
    allowShortcuts: true,
  },
};

// =============================================================================
// ROGUELIKE GRAMMAR
// =============================================================================

/**
 * Roguelike-style dungeon with high danger and risk/reward.
 *
 * Pattern:
 *   dungeon := entrance → floor+ → exit
 *   floor := (danger_room | reward_room)+ → [shop]
 *   danger_room := combat | combat combat | trap
 */
export const ROGUELIKE_GRAMMAR: Grammar = {
  id: "roguelike",
  name: "Roguelike Floor",
  description: "High-risk, high-reward floor with shops and danger",

  startSymbol: "dungeon",

  productions: [
    // Main structure
    production("dungeon", {
      symbols: [
        terminal("entrance"),
        nonTerminal("floor", "oneOrMore", 1, 3),
        terminal("boss"),
        terminal("exit"),
      ],
    }),

    // Floor segment
    production("floor", {
      symbols: [
        nonTerminal("room", "oneOrMore", 2, 4),
        terminal("shop", "optional"),
      ],
    }),

    // Room types
    production(
      "room",
      { symbols: [nonTerminal("danger_room")], weight: 4 },
      { symbols: [nonTerminal("reward_room")], weight: 2 },
      { symbols: [terminal("rest")], weight: 1 },
    ),

    // Danger rooms
    production(
      "danger_room",
      { symbols: [terminal("combat")] },
      { symbols: [terminal("combat"), terminal("combat")], weight: 0.5 },
      { symbols: [terminal("miniboss")], weight: 0.3 },
    ),

    // Reward rooms
    production(
      "reward_room",
      { symbols: [terminal("treasure")] },
      { symbols: [terminal("combat"), terminal("treasure")], weight: 0.7 },
    ),
  ],

  defaultTags: {
    ...DEFAULT_TAGS,
    combat: ["danger", "encounter", "high-risk"],
    treasure: ["reward", "loot", "high-reward"],
  },

  constraints: {
    ...DEFAULT_GRAMMAR_CONSTRAINTS,
    minNodes: 8,
    maxNodes: 18,
    minCombat: 5,
    maxCombat: 12,
    requireBoss: true,
    allowShortcuts: false, // Roguelikes typically don't have shortcuts
  },
};

// =============================================================================
// PUZZLE DUNGEON GRAMMAR
// =============================================================================

/**
 * Puzzle-focused dungeon with minimal combat.
 *
 * Pattern:
 *   dungeon := entrance → puzzle_wing+ → final_puzzle → treasure → exit
 *   puzzle_wing := puzzle+ → [reward]
 */
export const PUZZLE_GRAMMAR: Grammar = {
  id: "puzzle",
  name: "Puzzle Dungeon",
  description: "Cerebral challenges with minimal combat",

  startSymbol: "dungeon",

  productions: [
    production("dungeon", {
      symbols: [
        terminal("entrance"),
        nonTerminal("puzzle_wing", "oneOrMore", 2, 4),
        nonTerminal("final_challenge"),
        terminal("exit"),
      ],
    }),

    production("puzzle_wing", {
      symbols: [
        terminal("puzzle", "oneOrMore", 1, 2),
        terminal("treasure", "optional"),
        terminal("story", "optional"),
      ],
    }),

    production("final_challenge", {
      symbols: [
        terminal("puzzle"),
        terminal("puzzle"),
        terminal("treasure"),
      ],
    }),
  ],

  defaultTags: {
    ...DEFAULT_TAGS,
    puzzle: ["challenge", "mental", "primary"],
  },

  constraints: {
    ...DEFAULT_GRAMMAR_CONSTRAINTS,
    minNodes: 8,
    maxNodes: 16,
    minCombat: 0,
    maxCombat: 2,
    minTreasure: 2,
    requireBoss: false,
    allowShortcuts: true,
  },
};

// =============================================================================
// EXPLORATION GRAMMAR
// =============================================================================

/**
 * Exploration-focused dungeon with secrets and optional content.
 *
 * Pattern:
 *   dungeon := entrance → main_path → exit
 *   main_path := (room → [branch])+ → boss
 *   branch := secret | treasure | story
 */
export const EXPLORATION_GRAMMAR: Grammar = {
  id: "exploration",
  name: "Exploration Dungeon",
  description: "Open exploration with many optional secrets",

  startSymbol: "dungeon",

  productions: [
    production("dungeon", {
      symbols: [
        terminal("entrance"),
        nonTerminal("main_path"),
        terminal("exit"),
      ],
    }),

    production("main_path", {
      symbols: [
        nonTerminal("segment", "oneOrMore", 3, 6),
        terminal("boss"),
      ],
    }),

    production("segment", {
      symbols: [
        nonTerminal("main_room"),
        nonTerminal("branch", "optional"),
      ],
    }),

    production(
      "main_room",
      { symbols: [terminal("combat")], weight: 2 },
      { symbols: [terminal("puzzle")], weight: 1 },
      { symbols: [terminal("rest")], weight: 0.5 },
    ),

    production(
      "branch",
      { symbols: [terminal("secret")], weight: 2 },
      { symbols: [terminal("treasure")], weight: 2 },
      { symbols: [terminal("story")], weight: 1 },
      { symbols: [terminal("shop")], weight: 0.5 },
    ),
  ],

  defaultTags: {
    ...DEFAULT_TAGS,
    secret: ["optional", "hidden", "reward", "exploration"],
  },

  constraints: {
    ...DEFAULT_GRAMMAR_CONSTRAINTS,
    minNodes: 10,
    maxNodes: 22,
    minCombat: 3,
    maxCombat: 8,
    minTreasure: 2,
    requireBoss: true,
    allowShortcuts: true,
  },
};

// =============================================================================
// GRAMMAR REGISTRY
// =============================================================================

/**
 * All built-in grammars indexed by ID.
 */
export const BUILT_IN_GRAMMARS: Record<string, Grammar> = {
  classic: CLASSIC_GRAMMAR,
  metroidvania: METROIDVANIA_GRAMMAR,
  roguelike: ROGUELIKE_GRAMMAR,
  puzzle: PUZZLE_GRAMMAR,
  exploration: EXPLORATION_GRAMMAR,
};

/**
 * Get a grammar by ID.
 */
export function getGrammar(id: string): Grammar | undefined {
  return BUILT_IN_GRAMMARS[id];
}

/**
 * List all available grammar IDs.
 */
export function listGrammars(): string[] {
  return Object.keys(BUILT_IN_GRAMMARS);
}
