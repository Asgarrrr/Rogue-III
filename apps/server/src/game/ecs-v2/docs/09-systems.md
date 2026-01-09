# 09 - Systems & Scheduler

> La logique de jeu organisée

## Concept

Un **System** est une fonction qui traite les entités. Le **Scheduler** les exécute dans le bon ordre.

```
┌─────────────────────────────────────────────────────────────────┐
│                        GAME LOOP                                 │
│                                                                 │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐       │
│   │  PreUpdate   │ → │   Update     │ → │  PostUpdate  │       │
│   │              │   │              │   │              │       │
│   │ • Input      │   │ • Movement   │   │ • Render     │       │
│   │ • AI Think   │   │ • Combat     │   │ • Cleanup    │       │
│   │              │   │ • Physics    │   │              │       │
│   └──────────────┘   └──────────────┘   └──────────────┘       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Définir un System

### Méthode simple

```typescript
import { defineSystem, Phase } from "./ecs-v2";

const movementSystem = defineSystem({
  name: "Movement",
  phase: Phase.Update,
  fn: (world) => {
    world.query(Position, Velocity).run(view => {
      const x = view.column(Position, "x");
      const y = view.column(Position, "y");
      const vx = view.column(Velocity, "vx");
      const vy = view.column(Velocity, "vy");

      for (let i = 0; i < view.count; i++) {
        x[i] += vx[i];
        y[i] += vy[i];
      }
    });
  },
});
```

### Phases disponibles

```typescript
enum Phase {
  PreUpdate = 0,   // Avant la logique principale
  Update = 1,      // Logique principale
  PostUpdate = 2,  // Après la logique principale
}
```

---

## Enregistrer et Exécuter

```typescript
// Ajouter des systèmes
world.addSystem(inputSystem);
world.addSystem(aiSystem);
world.addSystem(movementSystem);
world.addSystem(combatSystem);
world.addSystem(renderSystem);

// Game loop
function gameLoop() {
  world.runTick();  // Exécute tous les systèmes
  requestAnimationFrame(gameLoop);
}
```

### Ordre d'exécution

```
world.runTick() exécute :

1. Tous les systems Phase.PreUpdate (dans l'ordre d'ajout)
2. Tous les systems Phase.Update
3. Tous les systems Phase.PostUpdate
4. world.events.flush() - Traite les événements
5. Efface les flags de changement
```

---

## Exemple de Systems pour un Roguelike

```typescript
// ═══════════════════════════════════════
// INPUT (PreUpdate)
// ═══════════════════════════════════════
const inputSystem = defineSystem({
  name: "Input",
  phase: Phase.PreUpdate,
  fn: (world) => {
    const player = world.query(Player, Position).first();
    if (!player) return;

    const input = world.getResource(InputState);
    if (!input) return;

    if (input.up) world.add(player, MoveIntent, { dx: 0, dy: -1 });
    if (input.down) world.add(player, MoveIntent, { dx: 0, dy: 1 });
    if (input.left) world.add(player, MoveIntent, { dx: -1, dy: 0 });
    if (input.right) world.add(player, MoveIntent, { dx: 1, dy: 0 });
  },
});

// ═══════════════════════════════════════
// AI (PreUpdate)
// ═══════════════════════════════════════
const aiSystem = defineSystem({
  name: "AI",
  phase: Phase.PreUpdate,
  fn: (world) => {
    world.query(AI, Position).not(Dead).run(view => {
      for (let i = 0; i < view.count; i++) {
        const entity = view.entity(i);
        const ai = world.get(entity, AI);

        // Logique AI basique
        if (ai.state === AIState.Patrol) {
          // Patrol logic...
          world.add(entity, MoveIntent, { dx: 1, dy: 0 });
        }
      }
    });
  },
});

// ═══════════════════════════════════════
// MOVEMENT (Update)
// ═══════════════════════════════════════
const movementSystem = defineSystem({
  name: "Movement",
  phase: Phase.Update,
  fn: (world) => {
    world.query(Position, MoveIntent).run(view => {
      const x = view.column(Position, "x");
      const y = view.column(Position, "y");
      const dx = view.column(MoveIntent, "dx");
      const dy = view.column(MoveIntent, "dy");

      for (let i = 0; i < view.count; i++) {
        x[i] += dx[i];
        y[i] += dy[i];
      }
    });

    // Nettoyer les intentions de mouvement
    for (const entity of world.query(MoveIntent).iter()) {
      world.remove(entity, MoveIntent);
    }
  },
});

// ═══════════════════════════════════════
// COMBAT (Update)
// ═══════════════════════════════════════
const combatSystem = defineSystem({
  name: "Combat",
  phase: Phase.Update,
  fn: (world) => {
    world.query(AttackIntent, Position, Attack).run(view => {
      for (let i = 0; i < view.count; i++) {
        const attacker = view.entity(i);
        const target = world.getEntityRef(attacker, AttackIntent, "target");

        if (target && world.has(target, Health)) {
          const attack = world.get(attacker, Attack)!;
          const health = world.get(target, Health)!;

          const newHealth = Math.max(0, health.current - attack.damage);
          world.set(target, Health, { current: newHealth });

          if (newHealth === 0) {
            world.add(target, Dead);
          }
        }

        world.remove(attacker, AttackIntent);
      }
    });
  },
});

// ═══════════════════════════════════════
// CLEANUP (PostUpdate)
// ═══════════════════════════════════════
const cleanupSystem = defineSystem({
  name: "Cleanup",
  phase: Phase.PostUpdate,
  fn: (world) => {
    // Supprimer les entités mortes
    for (const entity of world.query(Dead).iter()) {
      world.despawn(entity);
    }
  },
});
```

---

## Scheduler Avancé

### Accéder au scheduler

```typescript
const scheduler = world.scheduler;

// Ajouter un système
scheduler.register(mySystem);

// Exécuter manuellement une phase
scheduler.runPhase(world, Phase.Update);

// Exécuter tout
scheduler.runAll(world);
```

---

## Resources

Les **Resources** sont des données globales accessibles par les systèmes.

```typescript
// Définir une resource
class GameTime {
  deltaTime = 0;
  totalTime = 0;
}

// Set
world.setResource(GameTime, new GameTime());

// Get dans un système
const time = world.getResource(GameTime);
time.deltaTime = 0.016;  // 60 FPS

// Vérifier existence
if (world.hasResource(GameTime)) { ... }
```

### Exemple : Input State

```typescript
class InputState {
  up = false;
  down = false;
  left = false;
  right = false;
  attack = false;
}

// Setup
world.setResource(InputState, new InputState());

// Mettre à jour (hors ECS, dans ton event listener)
document.addEventListener("keydown", (e) => {
  const input = world.getResource(InputState)!;
  if (e.key === "ArrowUp") input.up = true;
  // ...
});
```

---

## Pattern : System avec État

```typescript
// Système avec état interne
function createSpawnerSystem(spawnInterval: number) {
  let timer = 0;

  return defineSystem({
    name: "Spawner",
    phase: Phase.Update,
    fn: (world) => {
      const time = world.getResource(GameTime);
      timer += time?.deltaTime ?? 0;

      if (timer >= spawnInterval) {
        timer = 0;
        // Spawner un ennemi...
        prefabs.spawn(world, "Goblin");
      }
    },
  });
}

world.addSystem(createSpawnerSystem(5.0));  // Spawn toutes les 5s
```

---

## Résumé

```
┌────────────────────────────────────────────────────────────────┐
│                   SYSTEMS & SCHEDULER                           │
│                                                                │
│  defineSystem({      world.addSystem()      world.runTick()    │
│    name,                                                       │
│    phase,            ┌───────────────────────────────────┐     │
│    fn               │         Scheduler                  │     │
│  })                  │  ┌─────────┬─────────┬─────────┐  │     │
│                      │  │PreUpdate│ Update  │PostUpdate│  │     │
│                      │  │  S1,S2  │ S3,S4,S5│  S6,S7   │  │     │
│                      │  └────┬────┴────┬────┴────┬────┘  │     │
│                      │       │         │         │       │     │
│                      │       ▼         ▼         ▼       │     │
│                      │     run()     run()     run()    │     │
│                      └───────────────────────────────────┘     │
│                                                                │
│  Resources : Données globales (GameTime, InputState, etc.)     │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

**Suivant :** [10 - Events](./10-events.md)
