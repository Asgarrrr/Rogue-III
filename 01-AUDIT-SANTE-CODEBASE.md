# Rogue III - Audit de Sante du Codebase
> Date: 2026-01-02 | Version: 1.0 | Auteur: Sisyphus

---

## Resume Executif

| Metrique | Valeur | Evaluation |
|----------|--------|------------|
| Tests | 506 pass / 3 skip / 0 fail | Excellent |
| Assertions | 17,839 expect() calls | Excellent |
| TypeScript | 1 erreur de resolution | A corriger |
| Architecture | ECS + Procgen + Multiplayer | State of the Art |
| Templates | 5 IDs desynchronises | CRITIQUE |
| Determinisme | 3 usages Math.random() dans gameplay | CRITIQUE |

---

## Table des Matieres

1. [Points Forts (State of the Art)](#1-points-forts-state-of-the-art)
2. [Problemes Critiques](#2-problemes-critiques)
3. [Problemes Importants](#3-problemes-importants)
4. [Points d'Attention](#4-points-dattention)
5. [Questions en Suspens](#5-questions-en-suspens)
6. [Recommandations](#6-recommandations)
7. [Checklist de Correction](#7-checklist-de-correction)

---

## 1. Points Forts (State of the Art)

### 1.1 Architecture ECS Exemplaire

```
World -> EntityManager + ComponentRegistry + SystemScheduler
      |
      v
      QueryCache (invalidation selective par composant)
      |
      v
      CommandBuffer (mutations differees pour coherence)
```

**Caracteristiques notables:**
- **Hybrid Storage**: TypedArrays (SoA) pour hot-path, Objects (AoS) pour donnees complexes
- **Builder Pattern** pour ComponentSchemas - API declarative elegante
- **Phase System** (PreUpdate, Update, PostUpdate, Render) bien structure
- **Generation Counter** pour detection de references obsoletes (stale entity detection)
- **Query Cache** avec index inverse composant -> queries pour O(1) invalidation

**Fichiers cles:**
- `apps/server/src/engine/ecs/core/world.ts`
- `apps/server/src/engine/ecs/core/entity-manager.ts`
- `apps/server/src/engine/ecs/core/query-cache.ts`

### 1.2 Generation Procedurale Deterministe

**PRNG de qualite:**
- **Algorithme**: xorshift128+ 64-bit
- **Seeding**: SplitMix64 pour decorrelation des streams
- **5 streams independants**: layout, rooms, connections, details, content
- **Warm-up**: 8 iterations initiales pour disperser correlation

**Share Codes:**
- Format Base64URL avec CRC32 checksum
- Reproductibilite parfaite garantie (verifie par property tests)

**Algorithmes de generation:**
- **BSP** (Binary Space Partitioning): Donjons structures, garantie de connectivite
- **Cellular Automata**: Cavernes organiques, analyse de regions, pathfinding A* JPS

**Validation:**
- Invariants verifies systematiquement (connectivite, densite, dimensions)
- Tests de determinisme (meme seed = meme donjon)

**Fichiers cles:**
- `apps/server/src/engine/dungeon/core/random/seeded-random.ts`
- `apps/server/src/engine/dungeon/dungeon-manager.ts`
- `apps/server/src/engine/dungeon/validation/invariants.ts`

### 1.3 Type Safety Exceptionnelle

**Result<T, E> Pattern (inspire de Rust):**
```typescript
const result = validateConfig(input)
  .map(config => generateDungeon(config))
  .mapErr(err => new UserFriendlyError(err))
  .getOrThrow();
```

**DungeonError type avec factory methods:**
- `DungeonError.configInvalid()`
- `DungeonError.generationTimeout()`
- `DungeonError.generationFailed()`

**Zod schemas partages** dans `@rogue/contracts`

**Fichiers cles:**
- `packages/contracts/src/types/result.ts`
- `packages/contracts/src/types/error.ts`

### 1.4 Infrastructure de Tests Robuste

| Type de Test | Couverture | Fichiers |
|--------------|------------|----------|
| Unit Tests | ECS, Dungeon, Seeds | 25+ fichiers |
| Integration Tests | Dungeon + ECS | `dungeon-integration.test.ts` |
| Property Tests | Determinisme | `determinism.property.test.ts` |
| Performance Tests | Baselines temporelles | `benchmarks.test.ts` |
| Invariant Tests | Validation donjons | `dungeon-invariants.test.ts` |

**Baselines de performance:**
```typescript
const BASELINES = {
  cellular_60x30: 25,    // ms
  cellular_120x90: 80,
  bsp_60x30: 15,
  bsp_120x90: 25,
  rng_1M_operations: 300,
};
```

### 1.5 Infrastructure Moderne

| Technologie | Version | Usage |
|-------------|---------|-------|
| Bun | 1.3.3 | Runtime |
| Turborepo | 2.6.1 | Monorepo |
| Biome | 2.3.7 | Linting + Formatting |
| TypeScript | 5.9.2 | Type Safety |
| Elysia | 1.4.6 | HTTP + WebSocket |
| Better-Auth | 1.4.4 | Authentication |
| Drizzle | 0.44.7 | ORM |

**CI/CD:**
- GitHub Actions avec quality gates
- Lint, Type Check, Tests automatises

### 1.6 Systeme FOV Optimise

- **Algorithme**: Recursive Shadowcasting
- **Optimisations**:
  - Pool de resultats pre-alloues
  - Cache par position (BigInt key)
  - Invalidation sur changement de terrain
  - Uint32Array pour stockage compact des coords

**Fichier cle:** `apps/server/src/engine/ecs/game/systems/fov.ts`

### 1.7 Network Layer Bien Structure

- **Protocol**: WebSocket avec compression per-message deflate
- **Auth**: Cookie-based + One-Time Token pour cross-origin
- **State Sync**: Full state initial + deltas incrementaux
- **Heartbeat**: Ping/Pong avec mesure de latence
- **Reconnection**: Exponential backoff avec jitter

---

## 2. Problemes Critiques

### 2.1 CRITIQUE: Math.random() dans le Gameplay

**Impact**: Brise le determinisme - replays impossibles, bugs non reproductibles

**Occurrences:**

| Fichier | Ligne | Usage |
|---------|-------|-------|
| `ai.ts` | 72 | `getRandomDirection()` |
| `ai.ts` | 164 | Transition idle -> wander (10% chance) |
| `combat.ts` | 52 | Coup critique (10% chance) |

**Code problematique:**
```typescript
// ai.ts:72
return directions[Math.floor(Math.random() * directions.length)];

// ai.ts:164
if (ai.state === "idle" && Math.random() < 0.1) {
  return "wander";
}

// combat.ts:52
const critical = Math.random() < 0.1;
```

**Solution:**
Injecter un SeededRandom dans les systemes via World resources:
```typescript
const rng = world.resources.get<SeededRandom>("gameRng");
const critical = rng.probability(0.1);
```

### 2.2 CRITIQUE: Template IDs Desynchronises

**Impact**: 16 entites fail au spawn dans les tests d'integration

**Mapping des erreurs:**

| content-generator.ts | Template reel | Status |
|---------------------|---------------|--------|
| `sword` | `weapon_sword` | Mismatch |
| `leather_armor` | `armor_leather` | Mismatch |
| `health_potion` | `potion_health` | Mismatch |
| `steel_sword` | - | N'existe pas |
| `magic_scroll` | - | N'existe pas |
| `bread` | - | N'existe pas |
| `trap_spike` | `trap_spike` | OK |
| `trap_arrow` | `trap_arrow` | OK |
| `trap_fire` | `trap_fire` | OK |
| `trap_teleport` | `trap_teleport` | OK |

**Solution A**: Corriger les noms dans `content-generator.ts`
**Solution B**: Creer les templates manquants + alias

---

## 3. Problemes Importants

### 3.1 Erreur TypeScript moduleResolution

**Erreur:**
```
Cannot find module '@rogue/auth/schema'
Consider updating to 'node16', 'nodenext', or 'bundler'
```

**Cause:** `moduleResolution: "node"` ne supporte pas les exports conditionnels

**Fichier:** `apps/server/tsconfig.json`

**Solution:**
```json
{
  "compilerOptions": {
    "moduleResolution": "bundler"
  }
}
```

### 3.2 Cast `as any` non type

**Fichier:** `apps/server/src/engine/network/message-handler.ts:539`

```typescript
requestUnequip(this.world, playerId, slot as any);
```

**Solution:** Typer correctement le parametre slot

### 3.3 Casts `as unknown` potentiellement dangereux

| Fichier | Ligne | Contexte |
|---------|-------|----------|
| `cellular-generator.ts` | 504 | Grid initialization |
| `cellular-generator.ts` | 512 | GenContext cast |
| `spatial-hash.ts` | 147 | Point cast |
| `path-finder.ts` | 636 | Chain cast |

---

## 4. Points d'Attention

### 4.1 Architecture

| Point | Description | Priorite |
|-------|-------------|----------|
| `findSpawnPosition()` | Scan lineaire O(w*h), optimisable | Basse |
| `invalidateAll()` | Sur despawn, potentiellement couteux | Moyenne |
| Pas d'entity pooling | Allocations frequentes | Basse |
| Delta compression | Non implemente pour WebSocket | Moyenne |

### 4.2 Tests

| Point | Description |
|-------|-------------|
| Pas de tests E2E | Flow WebSocket complet non teste |
| Coverage non mesure | Pas de rapport dans CI |
| API dungeon | Routes non implementees (tests skipped) |

### 4.3 Securite

| Point | Description |
|-------|-------------|
| Rate limiting | Depend de Redis - pas de fallback |
| Input validation | Presente mais pas de fuzzing tests |
| WebSocket validation | Pas de schema Zod cote serveur |

### 4.4 TODOs Non Resolus

```
apps/server/src/engine/ecs/game/systems/ai.ts:220
// TODO: Implement patrol path

apps/server/tests/api/dungeon-api.test.ts:11-13
* TODO: Implement dungeon API routes
* TODO: Create src/app.ts or update web/index.ts
* TODO: Re-enable these tests once the API is ready
```

---

## 5. Questions en Suspens

### 5.1 Determinisme
> Le determinisme est-il crucial pour tout le jeu (replays parfaits, spectateur, etc.) ou seulement pour la generation de donjon ?

**Impact sur priorite du fix Math.random()**

### 5.2 Rendu
> Le rendu final sera ASCII, graphique PixiJS, ou les deux ?

**Fichiers concernes:** `ascii-renderer.ts`, integration PixiJS

### 5.3 Multiplayer
> - Co-op prevu ?
> - Solo avec spectating ?
> - Daily/Weekly runs partages ?

**Impact sur architecture reseau**

### 5.4 Persistance
> - Permadeath pur ?
> - Save on quit + delete on load (ironman) ?
> - Libre save/load ?

**Systeme de serialization existe mais pas de save/load de run**

### 5.5 Templates Manquants
> Creer `bread`, `steel_sword`, `magic_scroll` ou corriger `content-generator.ts` ?

---

## 6. Recommandations

### 6.1 Sprint 1 (Immediat)

| Priorite | Tache | Effort |
|----------|-------|--------|
| P0 | Remplacer Math.random() par SeededRandom | 2h |
| P0 | Corriger template IDs dans content-generator | 1h |
| P0 | Fixer moduleResolution dans tsconfig | 10min |
| P1 | Creer templates manquants (bread, steel_sword, magic_scroll) | 1h |
| P1 | Corriger `as any` dans message-handler | 30min |

### 6.2 Sprint 2-3 (Court terme)

| Priorite | Tache | Effort |
|----------|-------|--------|
| P1 | Ajouter validation template <-> content-generator a la compilation | 2h |
| P2 | Implementer API dungeon routes | 4h |
| P2 | Ajouter tests E2E WebSocket | 4h |
| P2 | Ajouter Zod validation sur messages WebSocket serveur | 2h |

### 6.3 Moyen Terme

| Priorite | Tache | Effort |
|----------|-------|--------|
| P2 | Entity pooling pour haute performance | 8h |
| P2 | Delta compression WebSocket | 4h |
| P3 | Metrics/observability (OpenTelemetry) | 8h |
| P3 | Implementer patrol path AI | 4h |

### 6.4 Vision Creative (Long terme)

| Idee | Description |
|------|-------------|
| Lore Procedural | Generer noms/histoires pour donjons |
| Shader ASCII | Effets de lumiere dynamique, FOV smooth |
| Music Reactive | Adapter musique au contexte |
| Secrets Meta | Donjons speciaux par share codes legendaires |
| Replay System | Enregistrer et rejouer runs parfaites |

---

## 7. Checklist de Correction

### Immediat
- [ ] Remplacer `Math.random()` dans `ai.ts:72`
- [ ] Remplacer `Math.random()` dans `ai.ts:164`
- [ ] Remplacer `Math.random()` dans `combat.ts:52`
- [ ] Corriger `sword` -> `weapon_sword` dans content-generator
- [ ] Corriger `leather_armor` -> `armor_leather`
- [ ] Corriger `health_potion` -> `potion_health`
- [ ] Creer template `steel_sword` OU remplacer par `weapon_sword`
- [ ] Creer template `magic_scroll` OU remplacer par `scroll_teleport`
- [ ] Creer template `bread` OU supprimer du pool
- [ ] Changer `moduleResolution: "bundler"` dans tsconfig.json
- [ ] Typer correctement le parametre slot dans message-handler.ts:539

### Court terme
- [ ] Ajouter test de coherence template IDs
- [ ] Implementer API dungeon
- [ ] Tests E2E WebSocket
- [ ] Validation Zod serveur

### Verification
- [ ] `bun test` passe sans warnings de template
- [ ] `bun run check-types` passe sans erreur
- [ ] Tests de determinisme passent avec nouveau RNG

---

## Annexes

### A. Commandes Utiles

```bash
# Lancer les tests
cd apps/server && bun test

# Verifier les types
bun run check-types

# Linter
bun run format-and-lint

# Demo generation donjon
bun run apps/server/test-dungeon-demo.ts
```

### B. Structure des Templates

```
apps/server/src/engine/ecs/game/templates/
  actors.ts      # Player, Goblin, Orc, Troll, etc.
  items.ts       # Weapons, Armor, Consumables
  environment.ts # Doors, Stairs, Traps, Decorations
  index.ts       # Registry et exports
```

### C. Flux de Generation Donjon

```
Seed Input
    |
    v
SeedManager.normalizeSeed()
    |
    v
SeedManager.generateSeeds() -> 5 streams
    |
    v
DungeonGenerator (BSP ou Cellular)
    |
    v
ContentGenerator -> EntitySpawnDescriptor[]
    |
    v
validateDungeonInvariants()
    |
    v
DungeonLoader -> World + GameMap
```

---

---

## 8. Alternatives Modernes et Ameliorations Potentielles

### 8.1 ECS: Garder ou Remplacer?

| Aspect | Implementation Actuelle | Alternative | Recommandation |
|--------|------------------------|-------------|----------------|
| **Performance** | Custom, bon | bitECS (10x plus rapide) | **GARDER** - Suffisant pour roguelike |
| **Type Safety** | Excellente | bitECS faible en TS | **GARDER** - Avantage clair |
| **Query Cache** | O(1) invalidation | Standard ECS | **GARDER** - Bien optimise |
| **Hybrid Storage** | SoA + AoS | Rare ailleurs | **GARDER** - Unique |

**Verdict ECS**: 🟢 **GARDER L'IMPLEMENTATION ACTUELLE**

L'ECS custom est de haute qualite. bitECS serait plus performant mais:
- Moins type-safe
- Pattern hybride SoA/AoS difficile a reproduire
- Query cache avec invalidation selective est un atout

**Amelioration suggeree**: Ajouter entity pooling pour eviter les allocations frequentes.

---

### 8.2 Validation: Zod vs Valibot vs ArkType

| Critere | Zod (actuel) | Valibot | ArkType |
|---------|--------------|---------|---------|
| Bundle Size | ~12KB | ~1.5KB | ~6KB |
| Performance | Bon | 2-3x plus rapide | 10x plus rapide |
| TypeScript | Excellent | Excellent | Le meilleur |
| Ecosystem | Tres riche | Croissant | Limite |
| Maturite | Stable | Stable | Beta |

**Verdict Validation**: 🟡 **MIGRATION OPTIONNELLE VERS VALIBOT**

Valibot offre:
- API quasi-identique a Zod (migration facile)
- 8x plus leger
- 2-3x plus rapide
- Parfait pour edge/client

```typescript
// Avant (Zod)
import { z } from "zod";
const schema = z.object({ name: z.string() });

// Apres (Valibot)
import * as v from "valibot";
const schema = v.object({ name: v.string() });
```

---

### 8.3 Result Type: Custom vs neverthrow

| Critere | Implementation Actuelle | neverthrow |
|---------|------------------------|------------|
| API | map, mapErr, flatMap | Identique + plus |
| Async | Result.fromPromise | ResultAsync natif |
| Combine | Non | combine, combineWithAllErrors |
| Size | ~2KB | ~5KB |
| Tests | Custom | Battle-tested |

**Verdict Result**: 🟡 **MIGRATION OPTIONNELLE**

neverthrow ajoute:
- `ResultAsync` pour chaines async fluides
- `combine()` pour agreger plusieurs Results
- `safeTry` pour blocs try/catch elegants

Mais l'implementation actuelle est solide et fonctionnelle.

---

### 8.4 AI State Machine: Switch/Case vs XState vs Behavior Trees

| Critere | Actuel (switch) | XState v5 | Behavior Trees |
|---------|-----------------|-----------|----------------|
| Complexite | Simple | Moyenne | Haute |
| Visualisation | Non | Excellent | Moyen |
| Determinisme | Manuel | Configurable | Naturel |
| Debugging | console.log | Inspector visuel | Variable |
| Scalabilite | Limitee | Excellente | Excellente |

**Verdict AI**: 🔴 **REFACTORING RECOMMANDE**

Le switch/case actuel dans `ai.ts`:
- Difficile a maintenir quand l'AI devient complexe
- Pas de visualisation des etats
- Determinisme brise par Math.random()

**Option A - XState** (recommande pour complexite moyenne):
```typescript
import { createMachine, createActor } from 'xstate';

const enemyMachine = createMachine({
  id: 'enemy',
  initial: 'idle',
  context: { target: null, rng: null },
  states: {
    idle: {
      on: { PLAYER_SPOTTED: 'chase' },
      after: { 
        // Deterministic delay using injected RNG
        WANDER_DELAY: 'wander' 
      }
    },
    chase: { /* ... */ },
    attack: { /* ... */ },
    flee: { /* ... */ }
  }
});
```

**Option B - Utility AI** (recommande pour roguelikes):
```typescript
// Score-based decision making
const actions = [
  { name: 'attack', score: () => distanceToPlayer < 2 ? 100 : 0 },
  { name: 'chase', score: () => distanceToPlayer < 10 ? 80 - distanceToPlayer * 5 : 0 },
  { name: 'flee', score: () => healthPercent < 0.2 ? 90 : 0 },
  { name: 'wander', score: () => 20 }
];
const best = actions.reduce((a, b) => a.score() > b.score() ? a : b);
```

---

### 8.5 Network Protocol: JSON vs MessagePack vs Protobuf

| Critere | JSON (actuel) | MessagePack | Protocol Buffers |
|---------|---------------|-------------|------------------|
| Taille | 100% | 50-70% | 30-50% |
| Vitesse encode | Baseline | 2x plus rapide | 3x plus rapide |
| Schema | Non | Non | Oui (strict) |
| Browser | Natif | @msgpack/msgpack | protobuf.js |
| Debug | Lisible | Binaire | Binaire |

**Verdict Network**: 🟡 **MESSAGEPACK OPTIONNEL**

Pour un roguelike turn-based, JSON est acceptable.
MessagePack devient interessant si:
- Beaucoup de joueurs simultanes
- Updates frequentes (real-time)
- Mobile/bandwidth limite

```typescript
import { encode, decode } from '@msgpack/msgpack';

// Serveur
ws.send(encode(stateUpdate)); // Binaire, plus compact

// Client
const update = decode(event.data);
```

---

### 8.6 Event System: Custom vs mitt vs EventEmitter3

| Critere | Actuel | mitt | EventEmitter3 |
|---------|--------|------|---------------|
| Size | ~1KB | 200B | 1.5KB |
| Type Safety | Bonne | Excellente | Moyenne |
| Features | Queue + handlers | Simple pub/sub | Complet |
| Wildcard | Oui (*) | Oui (*) | Oui |

**Verdict Events**: 🟢 **GARDER L'IMPLEMENTATION**

L'EventQueue actuelle offre:
- Queue avec traitement batch
- Type safety avec discriminated unions
- Integration ECS naturelle

---

### 8.7 Roguelike Toolkit: Custom vs rot.js

| Critere | Implementation Actuelle | rot.js |
|---------|------------------------|--------|
| FOV | Shadowcasting optimise | Shadowcasting |
| Pathfinding | A* JPS custom | A*, Dijkstra |
| Map Gen | BSP + Cellular | Arena, Uniform, Digger, Cellular |
| RNG | xorshift128+ | Alea (Mersenne Twister) |
| Scheduler | Energy-based | Speed, Simple, Action |

**Verdict Toolkit**: 🟢 **GARDER LES IMPLEMENTATIONS CUSTOM**

Les implementations actuelles sont:
- Plus performantes (optimisees pour le projet)
- Deterministes (xorshift128+ > Alea)
- Integrees a l'ECS

rot.js pourrait inspirer:
- Plus d'algorithmes de map gen
- Scheduler alternatifs
- Lighting system

---

### 8.8 Resume des Recommandations

| Composant | Action | Priorite | Effort | Impact |
|-----------|--------|----------|--------|--------|
| **AI System** | Refactorer vers Utility AI ou XState | P1 | 8h | Maintenabilite++ |
| **Math.random** | Remplacer par SeededRandom | P0 | 2h | Determinisme |
| **Valibot** | Migration depuis Zod | P3 | 4h | Performance+ |
| **MessagePack** | Optionnel si scaling | P4 | 4h | Bandwidth- |
| **neverthrow** | Optionnel | P4 | 2h | DX+ |
| **Entity Pooling** | Ajouter a ECS | P2 | 4h | Performance+ |
| **ECS Core** | Garder | - | - | - |
| **Event System** | Garder | - | - | - |
| **FOV/Pathfinding** | Garder | - | - | - |

---

### 8.9 Architecture Cible Suggeree

```
┌─────────────────────────────────────────────────────────────────┐
│                        ROGUE III v2.0                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   Validation    │  │   State Mgmt    │  │    Network      │ │
│  │   (Valibot)     │  │   (Custom ECS)  │  │   (JSON/MsgPk)  │ │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘ │
│           │                    │                    │          │
│  ┌────────▼────────────────────▼────────────────────▼────────┐ │
│  │                      ECS WORLD                            │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐  │ │
│  │  │ Components   │ │  Systems     │ │   Resources      │  │ │
│  │  │ (Hybrid SoA) │ │ (Phased)     │ │ (GameMap, RNG)   │  │ │
│  │  └──────────────┘ └──────────────┘ └──────────────────┘  │ │
│  │                                                           │ │
│  │  ┌──────────────────────────────────────────────────────┐│ │
│  │  │                 AI SYSTEM (NEW)                      ││ │
│  │  │  ┌────────────┐ ┌────────────┐ ┌────────────────┐   ││ │
│  │  │  │ Utility AI │ │ Behaviors  │ │ SeededRandom   │   ││ │
│  │  │  │ Scoring    │ │ Library    │ │ (deterministic)│   ││ │
│  │  │  └────────────┘ └────────────┘ └────────────────┘   ││ │
│  │  └──────────────────────────────────────────────────────┘│ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 DUNGEON GENERATION                       │   │
│  │   BSP | Cellular | [Future: Wave Function Collapse]     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

*Fin du rapport d'audit*
