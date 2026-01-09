# Contracts Knowledge Base

**Scope:** Shared types, Zod schemas, network protocol

## Structure
```
contracts/src/
├── index.ts            # Barrel export
├── network/
│   ├── protocol.ts     # WebSocket message types (~800 lines)
│   └── index.ts
├── schemas/
│   ├── dungeon.ts      # DungeonConfig validation
│   └── seed.ts         # Seed format validation
├── types/
│   ├── dungeon.ts      # Dungeon type definitions
│   ├── error.ts        # Error codes enum
│   └── result.ts       # Result<T, E> pattern
└── utils/
    ├── builder.ts      # Config builder utilities
    └── encoding.ts     # Base64URL encode/decode
```

## Network Protocol

### Client → Server
```typescript
type ClientMessage =
  | { type: "move"; direction: Direction }
  | { type: "attack"; targetId: number }
  | { type: "wait" }
  | { type: "pickup"; itemId: number }
  | { type: "use"; itemId: number }
  | { type: "drop"; itemId: number };
```

### Server → Client
```typescript
type ServerMessage =
  | { type: "state"; entities: WireEntity[]; turn: TurnInfo }
  | { type: "event"; event: GameEvent }
  | { type: "error"; code: ErrorCode; message: string };
```

### Wire Formats
```typescript
// Entity serialization for network
interface WireEntity {
  id: number;
  components: Record<string, unknown>;
  templateId?: string;
}

// Direction constants
const Direction = {
  N: 0, NE: 1, E: 2, SE: 3, S: 4, SW: 5, W: 6, NW: 7
} as const;
```

## Deprecated Aliases
```typescript
// Use WireEntity and toWireEntity instead
/** @deprecated */ export type Entity = WireEntity;
/** @deprecated */ export const toEntity = toWireEntity;
```

## Zod Schemas
```typescript
// Dungeon config validation
const DungeonConfigSchema = z.object({
  width: z.number().min(20).max(200),
  height: z.number().min(20).max(200),
  algorithm: z.enum(["bsp", "cellular"]),
  roomCount: z.number().min(3).max(50).optional(),
  // ...
});

// Seed validation
const SeedSchema = z.object({
  primary: z.number(),
  layout: z.number(),
  rooms: z.number(),
  connections: z.number(),
  details: z.number(),
});
```

## Result Type
```typescript
type Result<T, E> = 
  | { ok: true; value: T }
  | { ok: false; error: E };

// Usage
const result = generate(config);
if (result.ok) {
  const dungeon = result.value;
} else {
  console.error(result.error);
}
```

## Import Pattern
```typescript
// From client or server
import { 
  ClientMessage, 
  ServerMessage, 
  Direction,
  DungeonConfigSchema,
  Result 
} from "@rogue/contracts";
```
