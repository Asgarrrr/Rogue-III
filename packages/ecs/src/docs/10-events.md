# 10 - Events

> Communication découplée entre systèmes

## Concept

Les **Events** permettent aux systèmes de communiquer sans se connaître directement.

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   CombatSystem ─── emit("damage") ───►  EventQueue             │
│                                              │                  │
│                                              │ flush()          │
│                                              ▼                  │
│   UISystem     ◄─── "damage" ─────── DamageHandler             │
│   AudioSystem  ◄─── "damage" ─────── DamageHandler             │
│   VFXSystem    ◄─── "damage" ─────── DamageHandler             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Définir un Type d'Event

```typescript
// Types d'événements
type DamageEvent = {
  type: "damage";
  target: Entity;
  amount: number;
  source: Entity;
};

type DeathEvent = {
  type: "death";
  entity: Entity;
  killer: Entity | null;
};

type LevelUpEvent = {
  type: "levelup";
  entity: Entity;
  newLevel: number;
};

// Union de tous les événements
type GameEvent = DamageEvent | DeathEvent | LevelUpEvent;
```

---

## Émettre des Events

```typescript
// Dans un système
const combatSystem = defineSystem({
  name: "Combat",
  phase: Phase.Update,
  fn: (world) => {
    world.query(AttackIntent, Attack).run(view => {
      for (let i = 0; i < view.count; i++) {
        const attacker = view.entity(i);
        const target = world.getEntityRef(attacker, AttackIntent, "target");
        if (!target) continue;

        const damage = view.column(Attack, "damage")[i];

        // Émettre un événement de dégâts
        world.emit({
          type: "damage",
          target,
          amount: damage,
          source: attacker,
        });
      }
    });
  },
});
```

---

## S'abonner aux Events

```typescript
// Ajouter un handler
world.events.subscribe("damage", (event: DamageEvent) => {
  console.log(`${event.target} a pris ${event.amount} dégâts de ${event.source}`);

  // Appliquer les dégâts
  const health = world.get(event.target, Health);
  if (health) {
    const newHealth = Math.max(0, health.current - event.amount);
    world.set(event.target, Health, { current: newHealth });

    if (newHealth === 0) {
      world.emit({ type: "death", entity: event.target, killer: event.source });
    }
  }
});

world.events.subscribe("death", (event: DeathEvent) => {
  console.log(`${event.entity} est mort !`);
  world.add(event.entity, Dead);
});
```

---

## Priorité des Handlers

Les handlers avec une priorité plus basse s'exécutent en premier.

```typescript
// Priorité basse = exécuté en premier
world.events.subscribe("damage", handleDamageLogic, { priority: 0 });

// Priorité haute = exécuté après
world.events.subscribe("damage", playDamageSound, { priority: 100 });
world.events.subscribe("damage", showDamageNumber, { priority: 100 });
```

---

## Flush des Events

Les événements sont stockés et traités à la fin du tick.

```typescript
// Pendant le tick
world.emit(event1);  // Stocké
world.emit(event2);  // Stocké
world.emit(event3);  // Stocké

// À la fin de runTick()
world.events.flush();  // Traite event1, event2, event3
```

### Flush manuel

```typescript
// Si besoin de traiter immédiatement
world.emit(event);
world.events.flush();  // Traite maintenant
```

---

## ⚠️ Sémantique de Flush Différé

**IMPORTANT:** Les événements émis PENDANT un flush ne sont PAS traités immédiatement.
Ils sont mis en queue pour le PROCHAIN flush.

```typescript
// ❌ Piège courant
world.events.on("combat.damage", (e) => {
  if (targetHealth <= 0) {
    // Cet événement ne sera PAS traité dans ce flush !
    world.events.emit({ type: "combat.death", entity: e.target });
  }
});

world.events.flush();  // Traite damage, mais death est en queue
// death n'a PAS été traité !
```

### Solution : Flush en boucle

```typescript
// ✅ Traiter tous les événements chaînés
while (world.events.hasPendingEvents()) {
  world.events.flush();
}

// Ou avec limite de sécurité
let maxIterations = 10;
while (world.events.hasPendingEvents() && maxIterations-- > 0) {
  world.events.flush();
}
```

### Pourquoi ce design ?

1. **Prévient la récursion infinie** - Pas de stack overflow
2. **Ordre déterministe** - Reproductible pour replay/debug
3. **Contrôle explicite** - Vous décidez quand traiter

---

## Ordre de Traitement (Déterminisme)

Les événements sont traités dans un ordre **strictement déterministe** :

1. **Types triés alphabétiquement** : `combat.damage` avant `combat.death`
2. **FIFO dans chaque type** : Premier émis = premier traité
3. **Handlers par priorité** : Plus basse priorité = exécuté en premier

```typescript
world.emit({ type: "b.event" });
world.emit({ type: "a.event" });
world.emit({ type: "b.event" });

world.events.flush();
// Ordre: a.event, b.event (1er), b.event (2e)
```

---

## API Complète

```typescript
const events = world.events;

// Émettre
events.emit(event);

// S'abonner
const unsubscribe = events.on("type", handler, priority?);
events.off("type", handler);

// Wildcard (tous les événements)
const unsubscribe = events.onAny(handler, priority?);

// Flush
events.flush();                    // Traiter la queue
events.hasPendingEvents(): boolean // Vérifier si queue non vide

// Debug
events.peek("type"): Event[]       // Voir sans consommer
events.drain("type"): Event[]      // Extraire et vider
```

---

## Se désabonner

```typescript
// Garder la référence du handler
const handler = (event: DamageEvent) => { ... };

world.events.subscribe("damage", handler);

// Plus tard
world.events.unsubscribe("damage", handler);
```

---

## Exemple Complet

```typescript
// ═══════════════════════════════════════
// Types d'événements
// ═══════════════════════════════════════
type GameEvent =
  | { type: "damage"; target: Entity; amount: number; source: Entity }
  | { type: "death"; entity: Entity; killer: Entity | null }
  | { type: "heal"; target: Entity; amount: number }
  | { type: "pickup"; entity: Entity; item: Entity }
  | { type: "levelup"; entity: Entity; level: number };

// ═══════════════════════════════════════
// Setup des handlers
// ═══════════════════════════════════════
function setupEventHandlers(world: World) {
  // Dégâts → Mise à jour santé
  world.events.subscribe("damage", (e) => {
    if (e.type !== "damage") return;
    const health = world.get(e.target, Health);
    if (!health) return;

    const newHealth = Math.max(0, health.current - e.amount);
    world.set(e.target, Health, { current: newHealth });

    if (newHealth === 0) {
      world.emit({ type: "death", entity: e.target, killer: e.source });
    }
  }, { priority: 0 });

  // Dégâts → Effets visuels
  world.events.subscribe("damage", (e) => {
    if (e.type !== "damage") return;
    spawnDamageNumber(world, e.target, e.amount);
  }, { priority: 10 });

  // Mort → Nettoyage
  world.events.subscribe("death", (e) => {
    if (e.type !== "death") return;
    world.add(e.entity, Dead);

    // Donner XP au tueur
    if (e.killer && world.has(e.killer, Experience)) {
      const xp = world.get(e.entity, XPValue)?.value ?? 10;
      // ... ajouter XP
    }
  });

  // Soin
  world.events.subscribe("heal", (e) => {
    if (e.type !== "heal") return;
    const health = world.get(e.target, Health);
    if (!health) return;

    const newHealth = Math.min(health.max, health.current + e.amount);
    world.set(e.target, Health, { current: newHealth });
  });
}
```

---

## Résumé

```
┌────────────────────────────────────────────────────────────────┐
│                        EVENTS                                   │
│                                                                │
│  Émettre            Queue              S'abonner               │
│  ───────            ─────              ──────────              │
│  world.emit()       events.flush()     events.subscribe()      │
│                                                                │
│                                                                │
│  ┌──────────┐      ┌──────────┐      ┌──────────────────┐     │
│  │ System A │─emit─►│  Queue   │─flush─►│ Handlers        │     │
│  │ System B │─emit─►│ [e1,e2]  │       │ • priority: 0   │     │
│  └──────────┘      └──────────┘       │ • priority: 10  │     │
│                                        └──────────────────┘     │
│                                                                │
│  Avantages :                                                   │
│  • Découplage entre systèmes                                   │
│  • Traitement différé (fin de tick)                            │
│  • Priorités pour ordonner les handlers                        │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## Limitations Actuelles

| Limitation | Impact | Workaround |
|------------|--------|------------|
| Pas de flush récursif natif | Events chaînés nécessitent boucle manuelle | `while (hasPendingEvents()) flush()` |
| Pas d'event replay/logging | Debug plus difficile | Logger manuellement dans handler |
| Types d'événements string-based | Pas de validation compile-time | Utiliser union types TypeScript |

---

## Améliorations Futures (Non Implémentées)

### Event Replay pour Debug

```typescript
// Futur: enregistrer tous les événements
world.events.enableRecording();
world.events.getRecordedEvents(); // Pour replay/debug
```

### Flush Récursif avec Depth Limit

```typescript
// Futur: option native
world.events.flush({ recursive: true, maxDepth: 10 });
```

### Typed Event Channels

```typescript
// Futur: canaux typés au lieu de strings
const DamageChannel = defineEventChannel<DamageEvent>();
world.events.emit(DamageChannel, event);
world.events.on(DamageChannel, handler); // Type-safe
```

---

**Suivant :** [11 - Hooks](./11-hooks.md)
