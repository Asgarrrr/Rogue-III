# Run Conditions

Les Run Conditions permettent de contrôler **quand** un système s'exécute, de manière déclarative et composable.

## Concept

Au lieu d'écrire des early returns manuels :

```typescript
// ❌ Avant
defineSystem("EnemyAI")
  .inPhase(Phase.Update)
  .execute((world) => {
    if (world.getResource(GameState) !== "playing") return;
    if (world.query(Enemy).count() === 0) return;
    // ... logique
  });
```

On déclare les conditions :

```typescript
// ✅ Après
defineSystem("EnemyAI")
  .inPhase(Phase.Update)
  .runIf(inState(GameState, "playing"))
  .runIf(anyWith(Enemy))
  .execute((world) => {
    // Logique directe, pas de boilerplate
  });
```

## API de Base

### Créer une condition

```typescript
import { condition } from "./ecs";

// Condition simple
const hasPlayer = condition((world) => world.query(Player).count() > 0);

// Utilisation
defineSystem("PlayerInput")
  .runIf(hasPlayer)
  .execute(...);
```

### Composition

Les conditions sont composables avec `.and()`, `.or()`, et `.not()` :

```typescript
// AND - les deux doivent être vraies
const canPlay = inState(GameState, "playing").and(anyWith(Player));

// OR - au moins une doit être vraie
const showUI = inState(GameState, "menu").or(inState(GameState, "paused"));

// NOT - inverse la condition
const notPaused = inState(GameState, "paused").not();

// Combinaisons complexes
const shouldProcess = inState(GameState, "playing")
  .and(anyWith(Enemy))
  .and(resourceExists(TurnState));
```

### Short-circuit

Les opérateurs `.and()` et `.or()` utilisent l'évaluation court-circuit :

```typescript
// Si resourceExists retourne false, anyWith n'est jamais appelé
resourceExists(Counter).and(anyWith(Enemy))
```

## Conditions Built-in

### État et Resources

```typescript
// Resource existe
resourceExists(Counter)

// Resource égale une valeur
resourceEquals(GameState, "playing")

// Resource satisfait un prédicat
resourceMatches(Health, h => h.current < 20)

// État (pour State Machine)
inState(GameState, "playing")
notInState(GameState, "paused")
```

### Entités

```typescript
// Au moins une entité avec les composants
anyWith(Enemy, Alive)

// Aucune entité avec les composants
noneWith(Player)

// Composant ajouté ce tick
componentAdded(Enemy)

// Composant modifié ce tick
componentChanged(Health)
```

### Temps

```typescript
// Tous les N ticks
everyNTicks(10)  // Tick 0, 10, 20, ...

// Après un certain tick
afterTick(100)   // true pour tick >= 100
```

### Événements

```typescript
// Événements en attente
hasEvent("combat.damage")
```

### Utilitaires

```typescript
// Une seule fois
runOnce()

// Toujours vrai/faux
always
never
```

## One-shot Systems

Pour les systèmes qui ne doivent s'exécuter qu'une fois :

```typescript
defineSystem("InitGame")
  .once()  // Auto-disable après première exécution
  .inPhase(Phase.PreUpdate)
  .execute((world) => {
    world.spawn(Player);
    world.setResource(Score, { value: 0 });
  });
```

Avec conditions :

```typescript
defineSystem("SpawnBoss")
  .once()
  .runIf(inState(GameState, "level5"))
  .execute((world) => {
    // Ne spawn qu'une fois quand on atteint level 5
    spawnBundle(world, BossBundle);
  });
```

## State Machine Pattern

Utiliser `State<T>` pour une machine à états simple :

```typescript
import { State, inState } from "./ecs";

// Définir l'état
class GameState extends State<"menu" | "playing" | "paused" | "gameover"> {}

// Initialiser
world.setResource(GameState, new GameState("menu"));

// Systèmes conditionnels
defineSystem("PlayerInput")
  .runIf(inState(GameState, "playing"))
  .execute(...);

defineSystem("PauseMenu")
  .runIf(inState(GameState, "paused"))
  .execute(...);

// Changer d'état
world.getResource(GameState)!.current = "playing";
```

## Performance

- Les conditions sont évaluées **avant** l'exécution du système
- Le short-circuit évite les évaluations inutiles
- Les conditions avec queries (`anyWith`, `componentAdded`) ont un coût O(n)
- Pour les conditions fréquentes, préférer les checks de resources O(1)

## Bonnes Pratiques

1. **Ordre des conditions** : Mettre les conditions les moins coûteuses en premier (short-circuit)

```typescript
// ✅ Bon - resource check rapide en premier
.runIf(inState(GameState, "playing"))
.runIf(anyWith(Enemy))  // Query plus lente

// ❌ Éviter - query lente en premier
.runIf(anyWith(Enemy))
.runIf(inState(GameState, "playing"))
```

2. **Réutiliser les conditions** :

```typescript
const whenPlaying = inState(GameState, "playing");
const hasEnemies = anyWith(Enemy);

defineSystem("EnemyAI").runIf(whenPlaying).runIf(hasEnemies);
defineSystem("EnemyRender").runIf(whenPlaying).runIf(hasEnemies);
```

3. **Éviter les conditions complexes dans les systèmes critiques** :

```typescript
// Pour les systèmes qui tournent chaque tick, minimiser les conditions
defineSystem("Physics")
  .runIf(inState(GameState, "playing"))  // Simple et rapide
  .execute(...);
```
