# Analyse ECS - Roguelike Tour par Tour

## Contexte

```
┌─────────────────────────────────────────────────────────────┐
│                      ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────┤
│  SERVEUR (ECS)                 │  CLIENT (Frontend)         │
│  ─────────────────             │  ────────────────          │
│  • Source de vérité unique     │  • Rendu visuel            │
│  • Logique de jeu              │  • Animations              │
│  • Validation des actions      │  • UI/UX                   │
│  • État du monde               │  • Input utilisateur       │
│  • IA des ennemis              │  • Effets visuels          │
└─────────────────────────────────────────────────────────────┘

Genre : Roguelike tour par tour
─────────────────────────────────
• Pas de temps réel → pas besoin de Fixed Timestep
• Tours séquentiels → pas besoin de parallélisme
• État discret → snapshot complet après chaque tour OK
• Déterministe par nature → pas de rollback netcode
```

---

## Table des Matières

1. [État Actuel](#état-actuel)
2. [Fonctionnalités Manquantes](#fonctionnalités-manquantes)
   - [P0 - Critique](#p0---critique)
   - [P1 - Haute](#p1---haute)
   - [P2 - Moyenne](#p2---moyenne)
   - [P3 - Basse / Non applicable](#p3---basse--non-applicable)
3. [Tech Debt](#tech-debt)
4. [Comparaison](#comparaison)

---

## État Actuel

L'ECS est **solide et bien adapté** pour un roguelike avec 342 tests passants.

### Architecture Core

```
┌─────────────────────────────────────────────────────────────┐
│                         World                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Archetypes  │  │   Entities   │  │  Resources   │      │
│  │  (SoA)       │  │ (Generational│  │  (Singletons)│      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Relations   │  │   Events     │  │   Systems    │      │
│  │  (Graph)     │  │  (Queue)     │  │  (Scheduler) │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### Ce qui est déjà parfait pour un roguelike

| Module | Utilité Roguelike |
|--------|-------------------|
| **Prefabs** | Génération procédurale (ennemis, items, salles) |
| **Serialization** | Sauvegardes / Chargements (permadeath = save on quit) |
| **Relations** | Inventaires (ChildOf), équipement, ciblage |
| **Events** | Réactions : piège déclenché, ennemi mort → loot |
| **Spatial Grid** | FOV, pathfinding A*, détection d'adjacence |
| **Hooks** | onAdd/onRemove pour setup/cleanup automatique |
| **Change Detection** | Envoyer uniquement les changements au client |

---

## Fonctionnalités Manquantes

---

## P0 - Critique

### 1. Turn System (Système de Tours)

**Qu'est-ce que c'est ?**
Un système pour gérer l'ordre des tours : qui joue, quand, et dans quel ordre.

**Pourquoi c'est critique pour un roguelike ?**
C'est le cœur du gameplay. Sans ça, impossible de savoir qui agit.

**Patterns courants :**

```typescript
// Pattern 1: Simple (joueur puis tous les ennemis)
enum TurnPhase { PlayerInput, PlayerAction, EnemyActions, EndTurn }

// Pattern 2: Initiative/Speed (comme D&D)
interface TurnOrder {
  queue: Entity[];           // File d'attente triée par initiative
  current: Entity | null;    // Qui joue actuellement
  tick: number;              // Compteur de tours global
}

// Pattern 3: Energy/Action Points (comme Cogmind, Caves of Qud)
@component
class Energy {
  current = i32(0);
  threshold = i32(100);  // Agit quand current >= threshold
  speed = i32(100);      // Gain par tick (100 = normal, 150 = rapide)
}
```

**API souhaitée :**
```typescript
// Resource pour l'état du tour
world.setResource(TurnState, {
  phase: TurnPhase.PlayerInput,
  currentActor: player,
  turnNumber: 0,
});

// Systèmes par phase
defineSystem("WaitForPlayerInput")
  .runIf(inPhase(TurnPhase.PlayerInput))
  .execute(...);

defineSystem("ProcessEnemyAI")
  .runIf(inPhase(TurnPhase.EnemyActions))
  .execute(...);

// Avancer au prochain acteur
world.nextTurn();
```

**Implémentation suggérée :**
```typescript
class TurnManager {
  private queue: Entity[] = [];

  // Recalculer l'ordre (appelé quand speed change ou entité spawn/despawn)
  rebuildQueue(world: World): void {
    this.queue = world.query(Energy, Actor)
      .collect()
      .sort((a, b) => world.get(b, Energy).speed - world.get(a, Energy).speed);
  }

  // Tick : ajouter de l'énergie, retourner qui peut agir
  tick(world: World): Entity[] {
    const ready: Entity[] = [];
    for (const entity of this.queue) {
      const energy = world.get(entity, Energy);
      energy.current += energy.speed;
      if (energy.current >= energy.threshold) {
        ready.push(entity);
      }
    }
    return ready;
  }

  // Après action, consommer l'énergie
  consumeAction(world: World, entity: Entity, cost: number = 100): void {
    const energy = world.get(entity, Energy);
    energy.current -= cost;
  }
}
```

---

### 2. Action Queue / Command Pattern

**Qu'est-ce que c'est ?**
Une file d'actions validées à exécuter. Le joueur ou l'IA soumet une action, elle est validée, puis exécutée.

**Pourquoi c'est important ?**
- Valider les actions AVANT exécution (pas de triche)
- Découpler input de l'exécution
- Permet l'annulation (undo) et le replay
- Animations côté client peuvent rejouer les actions

**API souhaitée :**
```typescript
// Types d'actions
type GameAction =
  | { type: "move"; entity: Entity; direction: Direction }
  | { type: "attack"; attacker: Entity; target: Entity }
  | { type: "useItem"; entity: Entity; item: Entity; target?: Entity }
  | { type: "wait"; entity: Entity }
  | { type: "pickup"; entity: Entity; item: Entity };

// Queue d'actions
const actionQueue = world.getResource(ActionQueue);

// Soumettre une action (depuis input ou IA)
actionQueue.submit({ type: "move", entity: player, direction: "north" });

// Valider et exécuter
const result = actionQueue.process(world);
// result: { success: true, events: [...] }
// ou { success: false, reason: "blocked by wall" }
```

**Implémentation suggérée :**
```typescript
class ActionQueue {
  private pending: GameAction[] = [];
  private history: GameAction[] = [];  // Pour undo/replay

  submit(action: GameAction): void {
    this.pending.push(action);
  }

  process(world: World): ActionResult[] {
    const results: ActionResult[] = [];

    for (const action of this.pending) {
      // 1. Valider
      const validation = this.validate(world, action);
      if (!validation.valid) {
        results.push({ success: false, reason: validation.reason });
        continue;
      }

      // 2. Exécuter
      const events = this.execute(world, action);
      this.history.push(action);
      results.push({ success: true, events });
    }

    this.pending = [];
    return results;
  }

  private validate(world: World, action: GameAction): ValidationResult {
    switch (action.type) {
      case "move":
        return this.validateMove(world, action);
      case "attack":
        return this.validateAttack(world, action);
      // ...
    }
  }

  private execute(world: World, action: GameAction): GameEvent[] {
    // Exécuter et retourner les événements générés
  }
}
```

---

### 3. State Machine (États de Jeu)

**Qu'est-ce que c'est ?**
Gérer les différents états du jeu et leurs transitions.

**États typiques d'un roguelike :**
```
┌──────────┐     ┌───────────┐     ┌──────────┐
│  Menu    │────▶│  Playing  │────▶│ GameOver │
└──────────┘     └───────────┘     └──────────┘
                       │ ▲
                       ▼ │
                 ┌───────────┐
                 │ Inventory │
                 │ Targeting │
                 │  Dialog   │
                 └───────────┘
```

**Pourquoi c'est important ?**
- Systèmes actifs différents selon l'état
- Input interprété différemment (flèches = move en Playing, scroll en Inventory)
- Cleanup automatique lors des transitions

**API souhaitée :**
```typescript
enum GameState {
  MainMenu,
  Playing,
  Inventory,
  Targeting,  // En train de choisir une cible pour un sort
  LevelUp,    // Choix de compétences
  GameOver
}

// Initialiser
world.initState(GameState, GameState.MainMenu);

// Callbacks de transition
world.onEnter(GameState.Playing, (world) => {
  world.spawn(Player, Position, Health, Inventory);
  generateDungeon(world);
});

world.onExit(GameState.Playing, (world) => {
  // Sauvegarder avant de quitter
  saveGame(world);
});

world.onEnter(GameState.Targeting, (world) => {
  world.setResource(TargetingState, {
    validTargets: [],
    range: 5,
    onSelect: (target) => castSpell(target)
  });
});

// Changer d'état
world.setState(GameState, GameState.Inventory);

// Run conditions
defineSystem("ProcessPlayerInput")
  .runIf(inState(GameState.Playing))
  .execute(...);

defineSystem("RenderTargetingOverlay")
  .runIf(inState(GameState.Targeting))
  .execute(...);
```

---

## P1 - Haute

### 4. ~~Run Conditions~~ ✅ IMPLÉMENTÉ

**Status :** Implémenté dans `schedule/run-condition.ts`

```typescript
// API disponible
import { condition, inState, anyWith, noneWith, resourceExists } from "./ecs";

defineSystem("EnemyAI")
  .runIf(inState(GameState, "playing"))
  .runIf(anyWith(Enemy))
  .execute(...);

// Composition avec .and(), .or(), .not()
const canPlay = inState(GameState, "playing").and(anyWith(Player));
```

**Conditions built-in :** `runOnce()`, `resourceExists()`, `resourceEquals()`, `resourceMatches()`, `anyWith()`, `noneWith()`, `hasEvent()`, `everyNTicks()`, `afterTick()`, `componentAdded()`, `componentChanged()`, `inState()`, `notInState()`, `always`, `never`

Voir documentation : [15-run-conditions.md](./15-run-conditions.md)

---

### 5. ~~One-shot Systems~~ ✅ IMPLÉMENTÉ

**Status :** Implémenté dans `schedule/system.ts`

```typescript
defineSystem("InitGame")
  .once()  // S'exécute une fois puis se désactive
  .execute((world) => {
    world.spawn(Player);
  });
```

Voir documentation : [15-run-conditions.md](./15-run-conditions.md)

---

### 6. ~~Hierarchy Helpers~~ ✅ IMPLÉMENTÉ

**Status :** Implémenté dans `relationship/hierarchy.ts`

```typescript
import { hierarchy } from "./ecs";

// Navigation
hierarchy.parent(world, entity);      // Entity | null
hierarchy.children(world, entity);    // Entity[]
hierarchy.ancestors(world, entity);   // Entity[]
hierarchy.descendants(world, entity); // Entity[]

// Manipulation
hierarchy.reparent(world, entity, newParent);
hierarchy.addChild(world, parent, child);
hierarchy.orphan(world, entity);
```

Voir documentation : [16-hierarchy-helpers.md](./16-hierarchy-helpers.md)

---

### 7. ~~Bundles~~ ✅ IMPLÉMENTÉ

**Status :** Implémenté dans `core/bundle.ts`

```typescript
import { bundle, spawnBundle } from "./ecs";

// Définition
const EnemyBundle = bundle(Position, Health, Enemy).defaults({
  Health: { current: 100, max: 100 },
});

// Composition
const BossBundle = EnemyBundle.with(Boss).defaults({
  Health: { current: 500, max: 500 },
});

// Spawn
const enemy = spawnBundle(world, EnemyBundle, {
  Position: { x: 10, y: 20 },
});
```

Voir documentation : [17-bundles.md](./17-bundles.md)

---

### 8. Observers (Reactive Queries)

**Qu'est-ce que c'est ?**
Callbacks déclenchés quand une **combinaison** de composants apparaît/disparaît.

**Différence avec les Hooks actuels :**
```typescript
// Hooks actuels - UN composant
world.hooks.register(Position, { onAdd: ... });

// Observers - patterns multi-composants
world.observe(Position, Enemy, Health)
  .onAdd((entity, pos, enemy, health) => {
    // Déclenché quand les 3 sont présents
    console.log("Nouvel ennemi spawn à", pos.x, pos.y);
  });
```

**Cas d'usage roguelike :**
```typescript
// Quand un ennemi meurt (Health removed ou <= 0)
world.observe(Enemy, Position).onRemove((entity, enemy, pos) => {
  spawnLoot(world, pos);
  world.emit({ type: "EnemyKilled", position: pos });
});

// Quand un item est ramassé (ajouté à un inventaire)
world.observe(Item, ChildOf).onAdd((entity, item, childOf) => {
  const owner = world.getRelationTarget(entity, ChildOf);
  world.emit({ type: "ItemPickedUp", item: entity, by: owner });
});

// Quand une entité devient visible (a Position + InFOV)
world.observe(Position, InFOV).onAdd((entity, pos) => {
  // Révéler sur la carte
});
```

---

### 5. Run Conditions

**Qu'est-ce que c'est ?**
Conditions pour décider si un système s'exécute ce tick.

**Problème actuel :**
```typescript
defineSystem("EnemyAI")
  .execute((world) => {
    // Check manuel répétitif
    if (world.getResource(TurnState).phase !== TurnPhase.EnemyActions) return;
    if (world.getResource(GameState) !== "playing") return;
    // ... logique
  });
```

**Avec Run Conditions :**
```typescript
defineSystem("EnemyAI")
  .runIf(inState(GameState.Playing))
  .runIf(inPhase(TurnPhase.EnemyActions))
  .runIf(anyWith(Enemy, Alive))  // Au moins un ennemi vivant
  .execute((world) => {
    // Directement la logique, pas de boilerplate
  });

// Conditions réutilisables
const whenPlaying = inState(GameState.Playing);
const whenPlayerTurn = inPhase(TurnPhase.PlayerAction);

defineSystem("ProcessPlayerMove").runIf(whenPlaying).runIf(whenPlayerTurn);
defineSystem("ProcessPlayerAttack").runIf(whenPlaying).runIf(whenPlayerTurn);
```

**Conditions built-in suggérées :**
```typescript
inState(state)              // GameState === state
inPhase(phase)              // TurnPhase === phase
resourceExists(Resource)    // Resource est définie
resourceEquals(Resource, v) // Resource.value === v
anyWith(...components)      // Au moins une entité avec ces composants
noneWith(...components)     // Aucune entité avec ces composants
eventPending(EventType)     // Un événement de ce type est en queue
```

---

### 6. FOV (Field of View) System

**Qu'est-ce que c'est ?**
Calcul de ce que le joueur peut voir. Fondamental pour tout roguelike.

**Note :** Tu as déjà `SpatialGrid` qui peut aider, mais le FOV est un calcul spécifique.

**Algorithmes populaires :**
- **Shadowcasting** (le plus courant, rapide)
- **Raycasting** (simple mais lent)
- **Diamond walls** (variante de shadowcasting)

**API suggérée :**
```typescript
// Composant pour marquer ce qui bloque la vue
@component
class BlocksVision {
  opacity = f32(1.0);  // 0 = transparent, 1 = opaque
}

// Composant pour les entités dans le FOV du joueur
@component
class InPlayerFOV {
  distance = i32(0);
  lastSeen = i32(0);  // Tick où vu pour la dernière fois
}

// Système FOV
defineSystem("CalculateFOV")
  .runIf(playerMoved)  // Ou manuellement quand nécessaire
  .execute((world) => {
    const player = world.query(Player, Position).single();
    const playerPos = world.get(player, Position);
    const visionRange = world.get(player, Vision).range;

    // Clear ancien FOV
    world.query(InPlayerFOV).run((view) => {
      for (let i = 0; i < view.count(); i++) {
        world.remove(view.entity(i), InPlayerFOV);
      }
    });

    // Calculer nouveau FOV (shadowcasting)
    const visible = calculateFOV(world, playerPos, visionRange);

    for (const { entity, distance } of visible) {
      world.add(entity, InPlayerFOV, { distance, lastSeen: world.tick });
    }
  });
```

---

### 7. Hierarchy Helpers

**Problème :**
La relation `ChildOf` existe mais les helpers pratiques manquent.

**Très utile pour :**
- Inventaires (items ChildOf player)
- Équipement (slots)
- Conteneurs (coffres avec items)

**API souhaitée :**
```typescript
// Navigation
world.parent(entity);       // → Entity | null
world.children(entity);     // → Entity[]
world.hasChildren(entity);  // → boolean

// Inventaire spécifique
world.inventory(entity);    // → Entity[] (tous les ChildOf)

// Manipulation
world.reparent(item, newOwner);  // Déplacer item vers autre inventaire
world.orphan(item);              // Retirer de l'inventaire (drop)

// Avec données de relation
world.getEquipmentSlot(item);  // Si relation a des données (slot: "weapon")
```

---

## P2 - Moyenne

### 8. Deferred Relation Operations

**Problème :**
Le `CommandBuffer` actuel ne supporte pas les relations.

```typescript
const buffer = new CommandBuffer();

// Actuellement impossible
buffer.relate(item, ChildOf, player);      // Ramasser
buffer.unrelate(item, ChildOf, player);    // Déposer

buffer.flush(world);
```

**Utile pour :**
- Batch pickup/drop
- Transferts d'inventaire
- Opérations atomiques

---

### 9. One-shot Systems

**Qu'est-ce que c'est ?**
Système qui s'exécute une fois puis se désactive.

```typescript
defineSystem("GenerateInitialDungeon")
  .once()
  .execute((world) => {
    generateDungeon(world, { depth: 1, difficulty: "easy" });
  });
```

**Utile pour :**
- Initialisation du niveau
- Setup one-time
- Migrations

---

### 10. System Sets / Groups

**Pour organiser les systèmes :**
```typescript
const TurnProcessingSet = systemSet("TurnProcessing")
  .inPhase(Phase.Update)
  .runIf(inState(GameState.Playing));

defineSystem("ValidateAction").inSet(TurnProcessingSet);
defineSystem("ExecuteAction").inSet(TurnProcessingSet).after("ValidateAction");
defineSystem("ApplyEffects").inSet(TurnProcessingSet).after("ExecuteAction");
defineSystem("CheckDeaths").inSet(TurnProcessingSet).after("ApplyEffects");
```

---

## P3 - Basse / Non Applicable

Ces fonctionnalités sont **moins pertinentes** pour un roguelike tour par tour :

| Feature | Raison |
|---------|--------|
| **Parallel System Execution** | Tours séquentiels, JS single-threaded |
| **Fixed Timestep** | Pas de temps réel |
| **Delta Serialization** | Snapshot complet après chaque tour suffit |
| **World Cloning / Rollback** | Pas de lag compensation (pas de temps réel) |
| **Query Prefetching / SIMD** | Pas de frame budget critique |

### Potentiellement utile plus tard

| Feature | Si besoin de... |
|---------|-----------------|
| **Dynamic Components** | Modding, éditeur de niveau |
| **Plugin System** | Architecture modulaire (combat plugin, magic plugin) |

---

## Tech Debt

~~Tous les problèmes de tech debt ont été résolus :~~

| Issue | Status | Solution |
|-------|--------|----------|
| ~~`subscribe()` deprecated~~ | ✅ Résolu | Méthode supprimée, utiliser `on()` |
| ~~Memory leak `clearByType()`~~ | ✅ Résolu | `entitiesWithRelations` nettoyé correctement |
| ~~`_resetRelationRegistry()` exposé~~ | ✅ Résolu | Fonction retirée des exports publics |
| ~~`StringPool.clear()` dangereux~~ | ✅ Résolu | Ajout validation `force` + check refs actives |

---

## Comparaison avec d'autres ECS

| Feature | Ton ECS | Bevy | Flecs |
|---------|---------|------|-------|
| Archetypes | ✅ | ✅ | ✅ |
| Generational IDs | ✅ | ✅ | ✅ |
| Relations | ✅ | ✅ | ✅ |
| Change Detection | ✅ | ✅ | ✅ |
| Prefabs | ✅ | ❌ | ✅ |
| Spatial Index | ✅ | ❌ | ❌ |
| Serialization | ✅ | ext | ✅ |
| Migrations | ✅ | ❌ | ❌ |
| **Turn System** | ❌ | ❌ | ❌ |
| State Machine | ❌ | ✅ | ❌ |
| Observers | ❌ | ✅ | ✅ |
| Run Conditions | ✅ | ✅ | ✅ |
| One-shot Systems | ✅ | ✅ | ❌ |
| Hierarchy Helpers | ✅ | ✅ | ✅ |
| Bundles | ✅ | ✅ | ❌ |

**Note :** Les ECS généralistes (Bevy, Flecs) n'ont pas de Turn System car ils ciblent le temps réel.

---

## Priorités d'Implémentation Suggérées

```
1. Turn System        ████████████ Critique - cœur du gameplay
2. Action Queue       ████████████ Critique - validation & exécution
3. State Machine      ████████████ Critique - états de jeu
4. Run Conditions     ████████████ ✅ IMPLÉMENTÉ
5. One-shot Systems   ████████████ ✅ IMPLÉMENTÉ
6. Hierarchy Helpers  ████████████ ✅ IMPLÉMENTÉ
7. Bundles            ████████████ ✅ IMPLÉMENTÉ
8. Observers          ████████░░░░ Haute - réactivité
9. FOV System         ████████░░░░ Haute - gameplay roguelike
10. Deferred Relations ████░░░░░░░░ Moyenne - convenience
```

---

## Résumé

Ton ECS est **déjà très bien équipé** pour un roguelike avec 342 tests passants.

### Récemment implémenté

- **Run Conditions** - Conditions composables pour les systèmes (Bevy-style)
- **One-shot Systems** - Systèmes qui s'exécutent une seule fois
- **Hierarchy Helpers** - Navigation parent-enfant complète
- **Bundles** - Groupes de composants réutilisables avec defaults

### Prochaines priorités

1. **Turn System** - Gérer qui joue quand
2. **Action Queue** - Valider et exécuter les actions
3. **State Machine** - États de jeu (playing, inventory, targeting)

Le reste (Observers, FOV) sont des améliorations d'ergonomie, pas des blockers.
