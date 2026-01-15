# Intelligence Module - Documentation Complète

## Table des Matières

1. [Philosophie](#philosophie)
2. [Architecture](#architecture)
3. [Constraints (Contraintes)](#constraints)
4. [Simulation](#simulation)
5. [Semantic (Contenu Sémantique)](#semantic)
6. [Grammar (Grammaires)](#grammar)
7. [Intégration Pipeline](#intégration-pipeline)
8. [Patterns Avancés](#patterns-avancés)
9. [Déterminisme](#déterminisme)
10. [Performance](#performance)
11. [Robustesse et Sécurité](#robustesse-et-sécurité)
12. [Structured Decision Tracing](#structured-decision-tracing) (NEW)
13. [Constraint Composition Algebra](#constraint-composition-algebra) (NEW)
14. [Budget-Aware Grammar Expansion](#budget-aware-grammar-expansion) (NEW)
15. [Statistical Evaluation Harness](#statistical-evaluation-harness) (NEW)

---

## Philosophie

Le module Intelligence transforme la génération procédurale **aléatoire** en génération **intentionnelle**.

### Avant (Génération Classique)
```
Seed → Algorithme → Donjon
        ↓
    "Voici des salles connectées"
```

### Après (Génération Intelligente)
```
Seed → Grammaire → Expérience → Contraintes → Simulation → Sémantique → Donjon
                      ↓              ↓            ↓            ↓
                "Arc narratif"  "Jouable"   "Équilibré"   "Significatif"
```

**Principe clé** : On génère d'abord l'**expérience de jeu**, puis on la spatialise.

---

## Architecture

```
src/
├── core/graph/               # Utilitaires partagés (NEW)
│   ├── index.ts              # Exports
│   ├── bfs-distance.ts       # Calcul de distances BFS (centralisé)
│   └── adjacency.ts          # Construction de matrices d'adjacence
│
└── intelligence/
    ├── constraints/          # Règles qui DOIVENT être respectées
    │   ├── types.ts          # Interfaces Constraint, ConstraintContext
    │   ├── solver.ts         # Validation + réparation + anti-oscillation
    │   └── built-in-constraints.ts
    │
    ├── simulation/           # Simulation de playthrough
    │   ├── types.ts          # SimulationState, WalkerResult, DimensionalScores
    │   ├── walker.ts         # Joueur virtuel
    │   └── analyzers/        # Détection de problèmes
    │       └── pacing-analyzer.ts  # Analyse dimensionnelle du pacing
    │
    ├── semantic/             # Entités avec sens
    │   ├── types.ts          # SemanticEntity, EntityRole
    │   └── entity-factory.ts # Création d'entités contextuelles
    │
    ├── grammar/              # Patterns narratifs
    │   ├── types.ts          # ExperienceGraph, GrammarProduction
    │   ├── expander.ts       # Expansion + garde de récursion
    │   ├── spatial-mapper.ts # Mapping graphe → salles + validation critique
    │   └── built-in-grammars.ts
    │
    └── passes/               # Passes pipeline
        ├── constraint-validation-pass.ts
        ├── simulation-validation-pass.ts
        ├── semantic-enrichment-pass.ts
        └── grammar-expansion-pass.ts
```

---

## Constraints

Les contraintes sont des **invariants de gameplay** qui doivent être satisfaits.

### Concept

```typescript
interface Constraint {
  id: string;
  name: string;
  priority: "critical" | "important" | "nice-to-have";

  // Évalue si la contrainte est satisfaite
  evaluate(ctx: ConstraintContext): ConstraintResult;

  // Suggère comment réparer une violation
  suggest?(ctx: ConstraintContext): RepairSuggestion[];
}
```

### Contraintes Built-in

| Contrainte | Priorité | Description |
|------------|----------|-------------|
| `createKeyBeforeLockConstraint()` | Critical | Le joueur trouve la clé avant la porte |
| `createMultiPathToBossConstraint(n)` | Critical | Au moins n chemins vers le boss |
| `createDifficultyProgressionConstraint()` | Important | Difficulté corrélée à la distance |
| `createFullConnectivityConstraint()` | Critical | Toutes les salles accessibles |
| `createSecretRoomBacktrackConstraint()` | Nice-to-have | Secrets accessibles sans trop de backtrack |
| `createMinRoomCountConstraint(min)` | Important | Minimum de salles requis |
| `createSpawnBalanceConstraint()` | Nice-to-have | Distribution équilibrée des spawns |

### Exemple: Créer une Contrainte Custom

```typescript
import {
  Constraint,
  ConstraintContext,
  ConstraintResult
} from "./intelligence";

/**
 * Contrainte: Chaque salle treasure doit avoir un guardian.
 */
function createTreasureGuardianConstraint(): Constraint {
  return {
    id: "treasure-guardian",
    name: "Treasure rooms must have guardians",
    priority: "important",

    evaluate(ctx: ConstraintContext): ConstraintResult {
      const violations: string[] = [];

      // Trouver les salles treasure
      const treasureRooms = ctx.rooms.filter(r => r.type === "treasure");

      for (const room of treasureRooms) {
        // Vérifier si la salle a un spawn enemy
        const hasGuardian = ctx.spawns.some(
          s => s.roomId === room.id && s.type === "enemy"
        );

        if (!hasGuardian) {
          violations.push(`Room ${room.id} has treasure but no guardian`);
        }
      }

      return {
        satisfied: violations.length === 0,
        violations,
        severity: violations.length > 0 ? 0.7 : 0,
      };
    },

    suggest(ctx: ConstraintContext) {
      const suggestions: RepairSuggestion[] = [];

      const treasureRooms = ctx.rooms.filter(r => r.type === "treasure");
      for (const room of treasureRooms) {
        const hasGuardian = ctx.spawns.some(
          s => s.roomId === room.id && s.type === "enemy"
        );

        if (!hasGuardian) {
          suggestions.push({
            action: "add_spawn",
            target: { roomId: room.id, type: "enemy" },
            confidence: 0.9,
            description: `Add guardian to treasure room ${room.id}`,
          });
        }
      }

      return suggestions;
    },
  };
}
```

### Exemple: Utilisation du Solver

```typescript
import {
  createConstraintSolver,
  createKeyBeforeLockConstraint,
  createMultiPathToBossConstraint,
  createDifficultyProgressionConstraint,
} from "./intelligence";

// Créer le solver avec les contraintes
const solver = createConstraintSolver([
  createKeyBeforeLockConstraint(),
  createMultiPathToBossConstraint(2),
  createDifficultyProgressionConstraint(0.5), // corrélation min 0.5
  createTreasureGuardianConstraint(),
]);

// Valider un état de donjon
const result = solver.validate(dungeonState, progressionGraph, rng);

if (!result.allSatisfied) {
  console.log("Violations critiques:", result.criticalViolations);
  console.log("Suggestions de réparation:", result.suggestions);

  // Appliquer les réparations automatiquement
  for (const suggestion of result.suggestions) {
    if (suggestion.confidence > 0.8) {
      applyRepair(dungeonState, suggestion);
    }
  }
}
```

---

## Simulation

Le système de simulation fait jouer un **joueur virtuel** pour détecter les problèmes.

### Concept

```typescript
interface WalkerResult {
  completed: boolean;           // A-t-il exploré tout ce qui est accessible?
  reachedExit: boolean;         // A-t-il atteint la sortie?
  softlocks: SoftlockInfo[];    // Situations bloquantes détectées
  metrics: SimulationMetrics;   // Statistiques de la run
  pathTaken: number[];          // Chemin suivi (room IDs)
  finalState: SimulationState;  // État final du joueur
}

interface SimulationMetrics {
  totalSteps: number;
  roomsVisited: number;
  combatEncounters: number;
  treasuresFound: number;
  keysCollected: number;
  doorsUnlocked: number;
  totalDamageReceived: number;
  potionsUsed: number;
  healthRemaining: number;
  healthRemainingRatio: number;
}
```

### Stratégies d'Exploration

```typescript
type ExplorationStrategy =
  | "random"         // Choix aléatoire
  | "nearest"        // Salle la plus proche non visitée
  | "completionist"  // Visite TOUT avant de sortir
  | "speedrun";      // Direct vers la sortie
```

### Exemple: Simuler et Analyser

```typescript
import {
  simulatePlaythrough,
  analyzePacing,
  DEFAULT_SIMULATION_CONFIG
} from "./intelligence";

// Configuration du joueur virtuel
const config = {
  ...DEFAULT_SIMULATION_CONFIG,
  startHealth: 100,
  maxHealth: 100,
  enemyDamage: 15,        // Dégâts moyens par ennemi
  potionHeal: 40,         // Soin par potion
  explorationStrategy: "completionist",
  maxSteps: 200,
};

// Simuler un playthrough
const result = simulatePlaythrough(
  dungeonState,
  progressionGraph,  // null si pas de lock-and-key
  config,
  () => rng.next(),  // RNG déterministe
);

console.log("Résultat de simulation:");
console.log(`  Complété: ${result.completed}`);
console.log(`  Sortie atteinte: ${result.reachedExit}`);
console.log(`  Salles visitées: ${result.metrics.roomsVisited}/${result.metrics.roomsTotal}`);
console.log(`  Combats: ${result.metrics.combatEncounters}`);
console.log(`  Santé restante: ${result.metrics.healthRemainingRatio * 100}%`);

// Analyser le pacing
const pacing = analyzePacing(result, dungeonState, config.startHealth);

console.log("\nAnalyse du pacing:");
console.log(`  Score global: ${(pacing.overallScore * 100).toFixed(1)}%`);

// NEW: Scores dimensionnels pour analyse granulaire
console.log(`  Scores par dimension:`);
console.log(`    - Combat: ${(pacing.dimensionalScores.combat * 100).toFixed(0)}%`);
console.log(`    - Treasure: ${(pacing.dimensionalScores.treasure * 100).toFixed(0)}%`);
console.log(`    - Exploration: ${(pacing.dimensionalScores.exploration * 100).toFixed(0)}%`);
console.log(`    - Resources: ${(pacing.dimensionalScores.resources * 100).toFixed(0)}%`);
console.log(`    - Flow: ${(pacing.dimensionalScores.flow * 100).toFixed(0)}%`);

console.log(`  Problèmes détectés:`);
for (const issue of pacing.issues) {
  console.log(`    - ${issue.type}: ${issue.description} (sévérité: ${issue.severity})`);
}

console.log("\nRecommandations:");
for (const rec of pacing.recommendations) {
  console.log(`  • ${rec}`);
}
```

### Scores Dimensionnels (NEW)

Les scores dimensionnels permettent une analyse **granulaire** du pacing:

| Dimension | Description | Ce qui l'affecte |
|-----------|-------------|------------------|
| `combat` | Courbe de difficulté lisse | Pénalisé par difficulty_spike |
| `treasure` | Distribution des récompenses | Basé sur l'espacement des trésors |
| `exploration` | Taux de découverte | Pénalisé par boring_stretch |
| `resources` | Disponibilité santé/potions | Pénalisé par resource_starvation |
| `flow` | Fluidité du parcours | Pénalisé par backtrack_fatigue |

```typescript
// Identifier la dimension problématique
const { dimensionalScores } = pacing;
const worstDimension = Object.entries(dimensionalScores)
  .sort(([,a], [,b]) => a - b)[0];

console.log(`Dimension la plus faible: ${worstDimension[0]} (${worstDimension[1]})`);
// → "Dimension la plus faible: resources (0.45)"
```

### Exemple de Sortie

```
Résultat de simulation:
  Complété: true
  Sortie atteinte: true
  Salles visitées: 12/12
  Combats: 7
  Santé restante: 35%

Analyse du pacing:
  Score global: 72.3%
  Scores par dimension:
    - Combat: 85%
    - Treasure: 72%
    - Exploration: 91%
    - Resources: 45%     ← Dimension problématique
    - Flow: 78%
  Problèmes détectés:
    - difficulty_spike: Sudden difficulty increase from 20% to 80% (sévérité: 0.8)
    - resource_starvation: Health critically low for 4 steps (sévérité: 0.6)

Recommandations:
  • Consider adding healing items before difficult encounters
  • Gradual enemy difficulty scaling would improve flow
  • Add more potion drops in mid-game areas
```

### Détecter les Softlocks

```typescript
if (result.softlocks.length > 0) {
  for (const softlock of result.softlocks) {
    console.error(`SOFTLOCK: ${softlock.reason}`);
    console.error(`  Salle bloquante: ${softlock.roomId}`);
    console.error(`  Salles inaccessibles: ${softlock.unreachableRooms.join(", ")}`);
    console.error(`  Clés manquantes: ${softlock.missingKeys.join(", ")}`);
  }

  // Rejeter ce donjon et régénérer
  throw new Error("Dungeon has softlocks, regenerating...");
}
```

---

## Semantic

Le système sémantique transforme des spawns **anonymes** en entités **significatives**.

### Avant (Sans Sémantique)
```typescript
{ type: "enemy", position: {x: 10, y: 5}, roomId: 3 }
// "Un ennemi quelque part"
```

### Après (Avec Sémantique)
```typescript
{
  id: "entity-3-0",
  template: "orc_warrior",
  role: "guardian",           // POURQUOI il est là
  guards: "treasure-room-3",  // CE QU'IL protège
  behavior: {
    movement: "stationary",   // COMMENT il se déplace
    combatStyle: "defensive", // COMMENT il combat
    detectionRange: 5,
    alertsAllies: false,
  },
  relationships: [
    { type: "guards", targetId: "treasure-room-3", strength: 1 }
  ],
  drops: {
    guaranteed: [],
    random: [{ itemId: "orc_weapon", dropChance: 0.2, quantity: [1,1], rarity: "uncommon" }],
    goldRange: [20, 50],
    experience: 35,
  },
  difficulty: 0.65,
  distanceFromStart: 4,
}
```

### Rôles d'Entités

| Rôle | Comportement | Cas d'usage |
|------|--------------|-------------|
| `guardian` | Stationnaire, défensif | Protège un trésor ou passage |
| `patrol` | Se déplace, alerte les alliés | Crée de la tension |
| `ambush` | Caché, attaque surprise | Jumpscares, pièges |
| `minion` | Faible, nombreux | Chair à canon |
| `elite` | Fort, territorial | Défi intermédiaire |
| `boss` | Très fort, berserker | Combat climactique |
| `neutral` | Non-hostile | PNJ informatifs |
| `merchant` | Non-hostile | Commerce |

### Exemple: Enrichir les Spawns

```typescript
import {
  createEntityFactory,
  DEFAULT_SEMANTIC_CONFIG,
  type EntityCreationContext,
} from "./intelligence";

// Configuration custom
const config = {
  ...DEFAULT_SEMANTIC_CONFIG,
  difficultyScaling: 2.0,  // Progression de difficulté plus agressive
  enemyTemplates: [
    ...DEFAULT_ENEMY_TEMPLATES,
    // Ajouter des templates custom
    {
      id: "shadow_assassin",
      name: "Shadow Assassin",
      baseDifficulty: 0.7,
      preferredRoles: ["ambush", "elite"],
      baseLoot: {
        guaranteed: [],
        random: [{ itemId: "shadow_blade", dropChance: 0.1, quantity: [1,1], rarity: "rare" }],
        goldRange: [30, 60],
        experience: 45,
      },
      tags: ["humanoid", "stealth", "deadly"],
    },
  ],
};

const factory = createEntityFactory(config);

// Contexte de création
const ctx: EntityCreationContext = {
  rooms: dungeonState.rooms,
  roomById: new Map(rooms.map(r => [r.id, r])),
  roomDistances: calculateDistances(rooms),
  maxDistance: 8,
  createdEntities: new Map(),
  createdItems: new Map(),
  config,
  rng: () => rng.next(),
};

// Créer des entités sémantiques
for (const spawn of dungeonState.spawns) {
  if (spawn.type === "enemy") {
    const entity = factory.createEntity(spawn, ctx);
    ctx.createdEntities.set(entity.id, entity);

    console.log(`Créé: ${entity.template} (${entity.role})`);
    console.log(`  Guards: ${entity.guards ?? "nothing"}`);
    console.log(`  Difficulty: ${(entity.difficulty * 100).toFixed(0)}%`);
    console.log(`  Behavior: ${entity.behavior.movement}, ${entity.behavior.combatStyle}`);
  }
}
```

### Exemple: Forcer un Rôle via Tags

```typescript
// Dans vos spawns, utilisez des tags pour influencer le rôle
const spawn: SpawnPoint = {
  position: { x: 15, y: 10 },
  roomId: 5,
  type: "enemy",
  tags: [
    "role:guardian",           // Force le rôle guardian
    "guards:boss-key",         // Spécifie ce qu'il garde
    "template:dark_mage",      // Force le template
  ],
  weight: 1,
  distanceFromStart: 5,
};
```

---

## Grammar

Les grammaires permettent de définir des **patterns narratifs** qui génèrent des structures de donjons.

### Concept

Une grammaire est un ensemble de règles de production qui génèrent un **graphe d'expérience** avant la spatialisation.

```
dungeon := entrance → exploration+ → climax → reward → exit
exploration := combat | treasure | puzzle
climax := miniboss? → boss
```

### Grammaires Built-in

| Grammar | Style | Description |
|---------|-------|-------------|
| `CLASSIC_GRAMMAR` | Linéaire | Combat → Combat → Boss → Trésor |
| `METROIDVANIA_GRAMMAR` | Non-linéaire | Clés, verrous, zones interconnectées |
| `ROGUELIKE_GRAMMAR` | High-risk | Beaucoup de danger, shops, floors |
| `PUZZLE_GRAMMAR` | Cérébral | Peu de combat, beaucoup de puzzles |
| `EXPLORATION_GRAMMAR` | Open-world | Beaucoup de secrets et branches |

### Exemple: Utiliser une Grammaire

```typescript
import {
  expandGrammar,
  METROIDVANIA_GRAMMAR,
  mapGraphToRooms,
} from "./intelligence";

// Générer le graphe d'expérience
const experienceGraph = expandGrammar(
  METROIDVANIA_GRAMMAR,
  seed,
  () => rng.next(),
  {
    minNodes: 12,
    maxNodes: 20,
    minCombat: 4,
    requireBoss: true,
  }
);

console.log("Graphe d'expérience généré:");
console.log(`  Nodes: ${experienceGraph.nodes.length}`);
console.log(`  Edges: ${experienceGraph.edges.length}`);
console.log(`  Types: ${experienceGraph.nodes.map(n => n.type).join(" → ")}`);

// Exemple de sortie:
// entrance → combat → puzzle → treasure → combat → miniboss → boss → treasure → exit

// Mapper sur les salles physiques
const mapping = mapGraphToRooms(
  experienceGraph,
  dungeonState.rooms,
  roomDistances,
  roomConnections,
);

console.log("\nMapping spatial:");
for (const m of mapping.mappings) {
  const node = experienceGraph.nodes.find(n => n.id === m.nodeId);
  console.log(`  ${node?.type} → Room ${m.roomId}`);
}
```

### Exemple: Créer une Grammaire Custom

```typescript
import type { Grammar, GrammarSymbol } from "./intelligence";

// Helpers
const terminal = (name: string): GrammarSymbol => ({
  name, terminal: true, repetition: "once", tags: []
});

const nonTerminal = (name: string, rep: string = "once", min?: number, max?: number): GrammarSymbol => ({
  name, terminal: false, repetition: rep as any, minRepeat: min, maxRepeat: max
});

/**
 * Grammaire "Gauntlet" - Séries de combats intenses avec repos
 */
export const GAUNTLET_GRAMMAR: Grammar = {
  id: "gauntlet",
  name: "Gauntlet",
  description: "Intense combat waves with rest points",

  startSymbol: "dungeon",

  productions: [
    // Structure principale
    {
      symbol: "dungeon",
      replacements: [{
        symbols: [
          terminal("entrance"),
          nonTerminal("wave", "oneOrMore", 3, 5),
          terminal("boss"),
          terminal("treasure"),
          terminal("exit"),
        ],
        weight: 1,
      }],
    },

    // Wave de combat
    {
      symbol: "wave",
      replacements: [
        {
          symbols: [
            terminal("combat"),
            terminal("combat"),
            terminal("combat"),
            terminal("rest"),
          ],
          weight: 2,
        },
        {
          symbols: [
            terminal("combat"),
            terminal("miniboss"),
            terminal("treasure"),
            terminal("rest"),
          ],
          weight: 1,
        },
      ],
    },
  ],

  defaultTags: {
    entrance: ["safe", "spawn"],
    combat: ["danger", "wave"],
    rest: ["safe", "healing", "checkpoint"],
    miniboss: ["danger", "elite"],
    boss: ["danger", "final"],
    treasure: ["reward"],
    exit: ["goal"],
    // ... autres types
  },

  constraints: {
    minNodes: 15,
    maxNodes: 30,
    minCombat: 10,
    maxCombat: 20,
    minTreasure: 2,
    maxDepth: 10,
    requireBoss: true,
    allowShortcuts: false,
  },
};

// Utilisation
const graph = expandGrammar(GAUNTLET_GRAMMAR, seed, rng);
```

### Exemple: Grammaire Conditionnelle

```typescript
const ADAPTIVE_GRAMMAR: Grammar = {
  id: "adaptive",
  // ...

  productions: [
    {
      symbol: "challenge",
      replacements: [
        // Combat si on est au début (depth < 3)
        {
          symbols: [terminal("combat")],
          weight: 2,
          condition: {
            type: "depth",
            params: { max: 3 },
          },
        },
        // Elite si on a déjà des combats (count > 5)
        {
          symbols: [terminal("miniboss")],
          weight: 1,
          condition: {
            type: "count",
            params: { type: "combat", min: 5 },
          },
        },
        // Puzzle aléatoirement (30% de chance)
        {
          symbols: [terminal("puzzle")],
          weight: 1,
          condition: {
            type: "random",
            params: { chance: 0.3 },
          },
        },
      ],
    },
  ],
};
```

---

## Intégration Pipeline

### Pipeline Complet avec Intelligence

```typescript
import { createPipeline } from "./pipeline";
import {
  createConstraintValidationPass,
  createSimulationValidationPass,
  createSemanticEnrichmentPass,
  createGrammarExpansionPass,
  createKeyBeforeLockConstraint,
  createMultiPathToBossConstraint,
  createDifficultyProgressionConstraint,
  METROIDVANIA_GRAMMAR,
} from "./intelligence";

const intelligentPipeline = createPipeline("intelligent-bsp", config)
  // ===== PASSES EXISTANTS =====
  .pipe(initializeState())
  .pipe(partitionBSP())
  .pipe(placeRooms())
  .pipe(buildConnectivity())
  .pipe(assignRoomTypes())
  .pipe(carveRooms())
  .pipe(carveCorridors())
  .pipe(calculateSpawns())
  .pipe(createLockAndKeyPass())

  // ===== PASSES INTELLIGENTS =====

  // 1. Optionnel: Expansion de grammaire (redéfinit les types de salles)
  .pipe(createGrammarExpansionPass({
    grammar: METROIDVANIA_GRAMMAR,
    updateRoomTypes: true,
  }))

  // 2. Validation des contraintes
  .pipe(createConstraintValidationPass({
    constraints: [
      createKeyBeforeLockConstraint(),
      createMultiPathToBossConstraint(2),
      createDifficultyProgressionConstraint(0.4),
    ],
    failOnCritical: true,
    attemptRepairs: true,
    maxRepairAttempts: 3,
  }))

  // 3. Simulation de playthrough
  .pipe(createSimulationValidationPass({
    strategy: "completionist",
    failOnSoftlock: true,
    failOnLowPacing: false,
    minPacingScore: 0.5,
    simulationConfig: {
      startHealth: 100,
      enemyDamage: 15,
      maxSteps: 200,
    },
  }))

  // 4. Enrichissement sémantique
  .pipe(createSemanticEnrichmentPass({
    semanticConfig: {
      difficultyScaling: 1.5,
    },
    validate: true,
    verbose: false,
  }))

  // ===== FINALISATION =====
  .pipe(finalizeDungeon())
  .build();

// Exécution
const result = intelligentPipeline.execute(seed);

// Le résultat contient maintenant:
// - experienceGraph: le graphe d'expérience
// - experienceMapping: le mapping nœuds → salles
// - semanticEnrichment: les entités sémantiques
```

### Pipeline Minimal (Validation Seulement)

```typescript
const validationPipeline = createPipeline("validated-bsp", config)
  .pipe(initializeState())
  // ... passes de génération ...

  // Juste la validation, pas d'enrichissement
  .pipe(createConstraintValidationPass({
    constraints: [
      createFullConnectivityConstraint(),
      createKeyBeforeLockConstraint(),
    ],
  }))
  .pipe(createSimulationValidationPass({
    strategy: "speedrun",
    failOnSoftlock: true,
  }))

  .pipe(finalizeDungeon())
  .build();
```

---

## Patterns Avancés

### Pattern: Génération avec Retry

```typescript
async function generateValidDungeon(
  seed: number,
  maxAttempts = 10
): Promise<DungeonResult> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const attemptSeed = seed + attempt * 1000000;

    try {
      const result = intelligentPipeline.execute(attemptSeed);

      // Vérifications supplémentaires
      const simulation = simulatePlaythrough(result, null, {}, rng);
      if (!simulation.reachedExit) {
        throw new Error("Exit not reachable");
      }

      const pacing = analyzePacing(simulation, result);
      if (pacing.overallScore < 0.6) {
        throw new Error(`Pacing too low: ${pacing.overallScore}`);
      }

      return result;

    } catch (error) {
      console.warn(`Attempt ${attempt + 1} failed: ${error.message}`);
    }
  }

  throw new Error(`Failed to generate valid dungeon after ${maxAttempts} attempts`);
}
```

### Pattern: Contraintes Dynamiques selon Difficulté

```typescript
function createDifficultyConstraints(difficulty: "easy" | "normal" | "hard") {
  const constraints = [
    createFullConnectivityConstraint(),
    createKeyBeforeLockConstraint(),
  ];

  switch (difficulty) {
    case "easy":
      constraints.push(
        createMultiPathToBossConstraint(3),  // Plus de chemins
        createSpawnBalanceConstraint({ maxEnemiesPerRoom: 2 }),
      );
      break;

    case "normal":
      constraints.push(
        createMultiPathToBossConstraint(2),
        createDifficultyProgressionConstraint(0.5),
      );
      break;

    case "hard":
      constraints.push(
        createMultiPathToBossConstraint(1),  // Un seul chemin
        createDifficultyProgressionConstraint(0.3),  // Plus chaotique
      );
      break;
  }

  return constraints;
}
```

### Pattern: Grammaire Sélectionnée par Thème

```typescript
function selectGrammarForTheme(theme: string): Grammar {
  switch (theme) {
    case "crypt":
    case "dungeon":
      return CLASSIC_GRAMMAR;

    case "temple":
    case "ruins":
      return PUZZLE_GRAMMAR;

    case "fortress":
    case "castle":
      return METROIDVANIA_GRAMMAR;

    case "arena":
    case "coliseum":
      return ROGUELIKE_GRAMMAR;

    case "forest":
    case "cavern":
      return EXPLORATION_GRAMMAR;

    default:
      return CLASSIC_GRAMMAR;
  }
}
```

### Pattern: Post-Processing des Entités

```typescript
function postProcessEntities(enrichment: SemanticEnrichment) {
  const processedEntities = enrichment.entities.map(entity => {
    // Ajuster les boss
    if (entity.role === "boss") {
      return {
        ...entity,
        drops: {
          ...entity.drops,
          // Boss drop toujours une clé spéciale
          guaranteed: [
            ...entity.drops.guaranteed,
            { itemId: "boss_key", dropChance: 1, quantity: [1, 1], rarity: "epic" }
          ],
          // Double l'XP
          experience: entity.drops.experience * 2,
        },
      };
    }

    // Ajuster les guardians de treasure
    if (entity.role === "guardian" && entity.guards?.includes("treasure")) {
      return {
        ...entity,
        behavior: {
          ...entity.behavior,
          alertsAllies: true,  // Guardian alerte les alliés
        },
      };
    }

    return entity;
  });

  return {
    ...enrichment,
    entities: processedEntities,
  };
}
```

---

## Déterminisme

**TOUT est déterministe**. Même seed = même donjon intelligent.

### Comment ça Marche

```typescript
// Chaque système utilise le RNG passé en paramètre
const rng = () => ctx.streams.details.next();

// Expansion de grammaire
const graph = expandGrammar(grammar, seed, rng);

// Simulation
const result = simulatePlaythrough(state, null, config, rng);

// Création d'entités
const entity = createSemanticEntity(spawn, { ...ctx, rng });
```

### Vérification du Déterminisme

```typescript
import { describe, expect, it } from "bun:test";

describe("determinism", () => {
  it("produces identical dungeons with same seed", () => {
    const seed = 42;

    const dungeon1 = intelligentPipeline.execute(seed);
    const dungeon2 = intelligentPipeline.execute(seed);

    // Mêmes salles
    expect(dungeon1.rooms.length).toBe(dungeon2.rooms.length);
    for (let i = 0; i < dungeon1.rooms.length; i++) {
      expect(dungeon1.rooms[i]).toEqual(dungeon2.rooms[i]);
    }

    // Mêmes entités sémantiques
    const entities1 = dungeon1.semanticEnrichment.entities;
    const entities2 = dungeon2.semanticEnrichment.entities;
    expect(entities1.length).toBe(entities2.length);
    for (let i = 0; i < entities1.length; i++) {
      expect(entities1[i].template).toBe(entities2[i].template);
      expect(entities1[i].role).toBe(entities2[i].role);
    }
  });
});
```

---

## Performance

### Budget Performance

Pour un donjon 80x60 (~15 salles):

| Système | Temps |
|---------|-------|
| Contraintes | ~5ms |
| Simulation | ~10ms |
| Sémantique | ~5ms |
| Grammaire | ~15ms |
| **Total** | **~35ms** |

**Reste dans le budget 100ms** pour la génération complète.

### Optimisations Implémentées

1. **Lazy evaluation**: Les contraintes ne recalculent pas si l'état n'a pas changé
2. **BFS optimisé**: Calcul des distances une seule fois
3. **Caching des adjacences**: Map précalculée
4. **Early exit**: Simulation s'arrête dès qu'un softlock est détecté

### Monitoring des Performances

```typescript
const pass = createSimulationValidationPass({
  // ...
});

// Les passes rapportent leurs métriques
pass.run(input, {
  ...ctx,
  metrics: {
    recordPassDuration: (passId, durationMs) => {
      console.log(`${passId}: ${durationMs}ms`);
    },
  },
});
```

---

## Robustesse et Sécurité

Le module Intelligence inclut plusieurs mécanismes de protection contre les cas limites.

### 1. Validation des Nœuds Critiques (Grammar)

Le mapping spatial **échoue explicitement** si les nœuds critiques ne peuvent pas être mappés:

```typescript
import { mapGraphToRooms, SpatialMappingError } from "./intelligence";

try {
  const mapping = mapGraphToRooms(graph, rooms, distances, adjacency, {
    failOnUnmappedCritical: true,  // Default: true
    logWarnings: true,
  });
} catch (error) {
  if (error instanceof SpatialMappingError) {
    console.error("Nœuds critiques non mappés:", error.message);
    // → "Critical nodes could not be mapped to rooms: boss(node-5), exit(node-7).
    //    Available rooms: 5, Required nodes: 10.
    //    Consider generating more rooms or reducing grammar complexity."
  }
}
```

**Nœuds critiques**: `entrance`, `exit`, `boss`

### 2. Garde de Récursion (Grammar Expander)

Prévient les stack overflow sur les grammaires malformées:

```typescript
import { expandGrammar, GrammarRecursionError } from "./intelligence";

try {
  const graph = expandGrammar(MALFORMED_GRAMMAR, seed, rng);
} catch (error) {
  if (error instanceof GrammarRecursionError) {
    console.error("Grammaire avec boucle infinie:", error.message);
    // → "Grammar expansion exceeded maximum recursion depth (50)
    //    while expanding symbol "loop" at depth 51.
    //    This usually indicates a malformed grammar with infinite loops.
    //    Check productions for cycles like A -> ... A ... without proper termination."
  }
}
```

**Limite**: 50 niveaux de récursion max.

### 3. Anti-Oscillation (Constraint Solver)

Le solver de contraintes **détecte et évite les réparations qui s'annulent**:

```typescript
// Scénario problématique (SANS protection):
// 1. Contrainte A suggère "add connection 1→2"
// 2. Contrainte B suggère "remove connection 1→2"
// 3. Loop infini...

// AVEC protection:
// Le solver track l'historique des réparations
// et skip les suggestions qui inversent une réparation précédente
const result = solver.solveWithRepairs(state, rng);
// → Terminates gracefully even with conflicting constraints
```

**Mécanisme**: Chaque réparation génère une signature. Les réparations inversées (add↔remove) sont détectées et skippées.

### 4. Utilitaires Partagés (core/graph)

Calcul de distances BFS **centralisé** pour éviter les bugs de duplication:

```typescript
import {
  calculateBFSDistances,
  calculateRoomGraphDistances,
  buildRoomAdjacency,
} from "./core/graph";

// Pour les graphes de salles (number IDs)
const adjacency = buildRoomAdjacency(rooms, connections);
const { distances, maxDistance } = calculateRoomGraphDistances(entranceId, adjacency);

// Pour les graphes d'expérience (string IDs)
import { buildStringGraphAdjacency, calculateStringGraphDistances } from "./core/graph";
const graphAdj = buildStringGraphAdjacency(nodes, edges);
const result = calculateStringGraphDistances(entryId, graphAdj);
```

**Avantage**: Un seul endroit à maintenir, tests centralisés.

### Résumé des Protections

| Protection | Erreur | Cas d'usage |
|------------|--------|-------------|
| `SpatialMappingError` | Nœuds critiques non mappés | Grammaire trop complexe pour les salles |
| `GrammarRecursionError` | Récursion > 50 | Grammaire malformée avec boucle |
| Repair History | (pas d'erreur, skip) | Contraintes en conflit |
| Shared BFS | (pas d'erreur, correctness) | Calculs de distance cohérents |

---

## Structured Decision Tracing

Le système de traçage structuré capture **chaque décision** prise pendant la génération, permettant une analyse approfondie et le débogage.

### Concept

```typescript
interface StructuredDecisionData {
  readonly system: DecisionSystem;      // Quel système a pris la décision
  readonly question: string;            // La question posée
  readonly options: readonly unknown[]; // Les options disponibles
  readonly chosen: unknown;             // L'option choisie
  readonly reason: string;              // Pourquoi ce choix
  readonly confidence: DecisionConfidence;  // high/medium/low
  readonly rngConsumed: number;         // Combien de RNG utilisé
  readonly context?: Record<string, unknown>;
}

type DecisionSystem =
  | "layout"       // Décisions de structure spatiale
  | "rooms"        // Placement et typage des salles
  | "connectivity" // Connexions entre salles
  | "spawns"       // Placement des spawns
  | "grammar"      // Expansion de grammaire
  | "constraints"  // Résolution de contraintes
  | "simulation"   // Simulation de playthrough
  | "semantic";    // Enrichissement sémantique
```

### Utilisation

```typescript
import type { TraceCollector } from "./pipeline";

// Dans un pass, enregistrer une décision structurée
ctx.trace.structuredDecision({
  system: "grammar",
  question: "Which production to expand for symbol 'challenge'?",
  options: ["combat", "puzzle", "treasure"],
  chosen: "combat",
  reason: "Weighted random selection, combat had highest weight (0.5)",
  confidence: "high",
  rngConsumed: 1,
  context: { depth: 3, totalNodes: 7 },
});
```

### Analyse des Décisions

```typescript
// Récupérer les statistiques de décision
const stats = ctx.trace.getDecisionStats();

console.log(`Total decisions: ${stats.totalDecisions}`);
console.log(`By system:`);
for (const [system, count] of Object.entries(stats.bySystem)) {
  console.log(`  ${system}: ${count}`);
}
console.log(`Confidence distribution:`);
console.log(`  High: ${stats.byConfidence.high}`);
console.log(`  Medium: ${stats.byConfidence.medium}`);
console.log(`  Low: ${stats.byConfidence.low}`);
console.log(`Total RNG consumed: ${stats.totalRngConsumed}`);

// Filtrer par système
const grammarDecisions = ctx.trace.getDecisionsBySystem("grammar");
for (const decision of grammarDecisions) {
  console.log(`Q: ${decision.question}`);
  console.log(`A: ${decision.chosen} (${decision.confidence})`);
}
```

### Cas d'Usage

| Use Case | Bénéfice |
|----------|----------|
| **Débogage** | Comprendre pourquoi un donjon a cette forme |
| **Analyse de biais** | Détecter si certains choix sont sur-représentés |
| **Optimisation RNG** | Identifier les systèmes qui consomment trop de RNG |
| **Reproductibilité** | Tracer exactement le chemin de génération |

---

## Constraint Composition Algebra

Les combinateurs de contraintes permettent de créer des **contraintes complexes** à partir de contraintes simples.

### Combinateurs Disponibles

```typescript
import { and, or, not, implies, weighted, createConstraintBuilder } from "./intelligence";

// AND: Toutes les contraintes doivent être satisfaites
const bothRequired = and(constraintA, constraintB);

// OR: Au moins une contrainte doit être satisfaite
const eitherOk = or(constraintA, constraintB);

// NOT: Inverse le résultat (satisfait ↔ violé)
const inverted = not(constraint);

// IMPLIES: Si A est violé, B doit être satisfait
// (Si on n'a pas de clé, on doit avoir un chemin alternatif)
const fallback = implies(hasKeyConstraint, alternatePathConstraint);

// WEIGHTED: Combine avec des poids pour le scoring
const weighted50_50 = weighted([
  { constraint: constraintA, weight: 0.5 },
  { constraint: constraintB, weight: 0.5 },
]);
```

### ConstraintBuilder (API Fluent)

```typescript
const complexConstraint = createConstraintBuilder()
  .withId("complex-validation")
  .withName("Complex Dungeon Validation")
  .withPriority("critical")
  .and(createFullConnectivityConstraint())
  .and(createKeyBeforeLockConstraint())
  .or(
    createMultiPathToBossConstraint(2),
    createSecretRoomBacktrackConstraint()
  )
  .build();

// Utilisation
const result = complexConstraint.evaluate(context);
```

### Logique de Combinaison

| Combinateur | Satisfait si... | Sévérité calculée |
|-------------|-----------------|-------------------|
| `and(A, B)` | A ET B satisfaits | max(A.severity, B.severity) |
| `or(A, B)` | A OU B satisfait | min(A.severity, B.severity) |
| `not(A)` | A violé | 1 - A.severity |
| `implies(A, B)` | A satisfait OU B satisfait | voir note |
| `weighted([...])` | score pondéré > 0.5 | somme pondérée |

### Exemple Pratique

```typescript
// Contrainte: "Le donjon doit avoir soit 2+ chemins vers le boss,
// soit des salles secrètes accessibles sans trop de backtrack"
const flexibleDungeon = or(
  createMultiPathToBossConstraint(2),
  createSecretRoomBacktrackConstraint()
);

// Contrainte: "Si c'est un donjon de type 'hard', exiger progression de difficulté"
const difficultyAware = implies(
  { ...createMinRoomCountConstraint(15), id: "hard-mode-check" },
  createDifficultyProgressionConstraint(0.6)
);
```

### Suggestions de Réparation

Les combinateurs **agrègent intelligemment** les suggestions:

- `and`: Combine toutes les suggestions de A et B
- `or`: Prend les suggestions de la contrainte la moins violée
- `weighted`: Trie par poids × confiance

---

## Budget-Aware Grammar Expansion

Le système de budget contrôle **combien de nœuds de chaque type** peuvent être créés pendant l'expansion de grammaire.

### Concept

```typescript
interface NodeTypeBudget {
  readonly min: number;    // Minimum requis (sinon échec)
  readonly max: number;    // Maximum autorisé
  readonly target?: number; // Objectif idéal
}

// Allocation de budget par type de nœud
type BudgetAllocation = Partial<Record<ExperienceNodeType, NodeTypeBudget>>;
```

### Création d'un Budget

```typescript
import {
  createBudgetAllocation,
  scaleBudgetAllocation,
  createBudgetTracker,
  DEFAULT_BUDGET_ALLOCATION,
} from "./intelligence";

// Budget par défaut
const budget = DEFAULT_BUDGET_ALLOCATION;

// Budget custom
const customBudget = createBudgetAllocation({
  combat: { min: 3, max: 8, target: 5 },
  treasure: { min: 2, max: 4 },
  puzzle: { min: 1, max: 3 },
  boss: { min: 1, max: 1 },  // Exactement 1 boss
  entrance: { min: 1, max: 1 },
  exit: { min: 1, max: 1 },
});

// Scaler un budget (pour donjons plus grands)
const scaledBudget = scaleBudgetAllocation(customBudget, 1.5);
// combat: { min: 4, max: 12, target: 7 }
```

### BudgetTracker

```typescript
const tracker = createBudgetTracker(budget);

// Vérifier si on peut créer un nœud
if (tracker.canSpend("combat")) {
  tracker.spend("combat");
  // Créer le nœud...
} else {
  console.log("Budget combat épuisé!");
}

// Status d'un type
const status = tracker.getStatus("combat");
// { type: "combat", current: 5, min: 3, max: 8, target: 5,
//   canSpend: true, atMinimum: true, atCapacity: false }

// Score de santé global (0-1)
const health = tracker.getHealthScore();
// 0.85 = la plupart des minimums atteints, pas de dépassement

// Types qui n'ont pas atteint leur minimum
const unsatisfied = tracker.getUnsatisfiedMinimums();
// ["treasure", "puzzle"]

// Types au maximum
const full = tracker.getAtCapacity();
// ["boss"]
```

### Intégration avec l'Expander

```typescript
import { expandGrammar } from "./intelligence";

const graph = expandGrammar(grammar, seed, rng, {
  budgetAllocation: customBudget,
  onBudgetExhausted: (type) => {
    console.warn(`Budget exhausted for ${type}, skipping node`);
  },
});
```

### Comportement de l'Expander avec Budget

| Situation | Comportement |
|-----------|-------------|
| Budget disponible | Crée le nœud normalement |
| Budget épuisé (non-critique) | Skip le nœud, retourne `null` |
| Budget épuisé (critique: entrance/exit/boss) | Force la création via `forceCreateNode()` |
| Minimum non atteint en fin d'expansion | Warning, score de santé réduit |

### Exemple Complet

```typescript
const budget = createBudgetAllocation({
  combat: { min: 5, max: 12 },
  treasure: { min: 2, max: 5 },
  boss: { min: 1, max: 1 },
});

const graph = expandGrammar(ROGUELIKE_GRAMMAR, seed, rng, {
  budgetAllocation: budget,
});

// Vérifier la santé du budget
const tracker = graph.metadata?.budgetTracker;
if (tracker) {
  const health = tracker.getHealthScore();
  if (health < 0.8) {
    console.warn(`Budget health low: ${health}`);
    console.warn(`Unsatisfied: ${tracker.getUnsatisfiedMinimums()}`);
  }
}
```

---

## Statistical Evaluation Harness

Le harness d'évaluation statistique permet d'analyser la **qualité de génération** sur un grand nombre d'échantillons.

### Concept

```typescript
interface EvaluationConfig {
  sampleCount: number;      // Nombre de donjons à générer
  baseSeed: number;         // Seed de départ
  parallelism?: number;     // Parallélisme (default: 1)
  collectHistograms?: boolean;  // Collecter les histogrammes
  histogramBins?: number;   // Nombre de bins (default: 10)
  timeout?: number;         // Timeout par génération (ms)
}

interface EvaluationResult {
  config: EvaluationConfig;
  samples: SampleResult[];
  metrics: Record<string, MetricStats>;
  histograms: Record<string, HistogramBin[]>;
  failures: FailureAnalysis[];
  summary: {
    successRate: number;
    avgGenerationTime: number;
    p95GenerationTime: number;
  };
}
```

### Utilisation Basique

```typescript
import { runEvaluation, formatEvaluationReport } from "./intelligence";

// Définir le générateur
const generator = (seed: number) => pipeline.execute(seed);

// Définir les métriques à collecter
const collector = (result: DungeonState) => ({
  roomCount: result.rooms.length,
  connectionCount: result.connections.length,
  enemyCount: result.spawns.filter(s => s.type === "enemy").length,
  treasureCount: result.spawns.filter(s => s.type === "treasure").length,
});

// Exécuter l'évaluation
const evaluation = await runEvaluation({
  config: {
    sampleCount: 100,
    baseSeed: 12345,
    collectHistograms: true,
  },
  generator,
  collector,
});

// Afficher le rapport
console.log(formatEvaluationReport(evaluation));
```

### Statistiques Disponibles

Pour chaque métrique, le harness calcule:

```typescript
interface MetricStats {
  name: string;
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  variance: number;
  p5: number;   // 5ème percentile
  p25: number;  // 25ème percentile (Q1)
  p75: number;  // 75ème percentile (Q3)
  p95: number;  // 95ème percentile
  p99: number;  // 99ème percentile
}
```

### Histogrammes

```typescript
// Accéder aux histogrammes
const roomHist = evaluation.histograms.roomCount;

for (const bin of roomHist) {
  const bar = "█".repeat(Math.round(bin.percentage * 50));
  console.log(`${bin.rangeStart.toFixed(0).padStart(3)}-${bin.rangeEnd.toFixed(0).padStart(3)}: ${bar} (${bin.count})`);
}

// Output:
//   8- 10: ███████ (7)
//  10- 12: ████████████████████ (20)
//  12- 14: █████████████████████████████████████ (37)
//  14- 16: ██████████████████████████ (26)
//  16- 18: ████████ (8)
//  18- 20: ██ (2)
```

### Analyse des Échecs

```typescript
// Analyser les échecs
for (const failure of evaluation.failures) {
  console.log(`Seed ${failure.seed}: ${failure.error}`);
  console.log(`  Stage: ${failure.stage}`);
  console.log(`  Partial state: ${failure.partialState ? "available" : "none"}`);
}

// Output:
// Seed 12389: ConstraintViolationError: Key-before-lock violated
//   Stage: constraint-validation
//   Partial state: available
```

### Validation Custom

```typescript
const evaluation = await runEvaluation({
  config: { sampleCount: 50, baseSeed: 0 },
  generator,
  collector,
  // Valider chaque donjon
  validator: (result) => {
    if (result.rooms.length < 8) {
      throw new Error("Too few rooms");
    }
    if (!result.rooms.some(r => r.type === "boss")) {
      throw new Error("No boss room");
    }
  },
  // Simuler chaque donjon
  simulator: (result) => {
    const sim = simulatePlaythrough(result, null, config, rng);
    return {
      reachedExit: sim.reachedExit,
      healthRemaining: sim.metrics.healthRemainingRatio,
      pacingScore: analyzePacing(sim, result).overallScore,
    };
  },
});
```

### Exemple de Rapport

```
═══════════════════════════════════════════════════════════════════════════════
                        STATISTICAL EVALUATION REPORT
═══════════════════════════════════════════════════════════════════════════════

Configuration:
  Samples: 100
  Base Seed: 12345
  Parallelism: 1

Summary:
  Success Rate: 97.0%
  Avg Generation Time: 45.2ms
  P95 Generation Time: 78.4ms

Metrics:
┌──────────────────┬───────┬───────┬───────┬───────┬───────┬───────┐
│ Metric           │  Min  │  Max  │  Mean │ StdDev│  P50  │  P95  │
├──────────────────┼───────┼───────┼───────┼───────┼───────┼───────┤
│ roomCount        │     8 │    18 │  12.4 │   2.1 │    12 │    16 │
│ connectionCount  │    10 │    25 │  15.8 │   3.2 │    15 │    22 │
│ enemyCount       │     5 │    15 │   9.2 │   2.5 │     9 │    14 │
│ treasureCount    │     2 │     6 │   3.8 │   1.1 │     4 │     5 │
│ pacingScore      │  0.45 │  0.92 │  0.71 │  0.12 │  0.72 │  0.85 │
└──────────────────┴───────┴───────┴───────┴───────┴───────┴───────┘

Histograms:
roomCount:
   8-10: ████████ (8)
  10-12: ██████████████████████████ (26)
  12-14: ████████████████████████████████████████ (40)
  14-16: ██████████████████ (18)
  16-18: ██████ (6)
  18-20: ██ (2)

Failures (3):
  Seed 12389: ConstraintViolationError at constraint-validation
  Seed 12412: SoftlockDetectedError at simulation-validation
  Seed 12467: GrammarExpansionError at grammar-expansion

═══════════════════════════════════════════════════════════════════════════════
```

---

## Conclusion

Le module Intelligence transforme procgen-v2 d'un générateur de **structures** en un générateur d'**expériences**:

1. **Contraintes** garantissent la jouabilité
2. **Simulation** valide l'équilibre avec **scores dimensionnels**
3. **Sémantique** donne du sens aux entités
4. **Grammaires** créent des arcs narratifs avec **validation stricte**

Tout reste **100% déterministe**, **performant**, et **robuste** face aux cas limites.

```typescript
// Le pouvoir en une ligne:
const dungeon = intelligentPipeline.execute(seed);
// → Un donjon jouable, équilibré, significatif, reproductible
```
