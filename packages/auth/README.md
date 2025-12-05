# @rogue/auth

Shared authentication package for Rogue III using [Better Auth](https://better-auth.com).

## Features

- ✅ **Shared Configuration**: Centralized auth config for both server and client
- ✅ **Redis Support**: Optional secondary storage for sessions and rate limiting
- ✅ **Cookie Cache**: 5-minute JWT/JWE cache in cookies for zero-latency auth checks
- ✅ **Rate Limiting**: Configurable rate limits per endpoint (requires Redis)
- ✅ **Type Safety**: Full TypeScript support with inferred types
- ✅ **Database Agnostic**: Uses Drizzle ORM with shared schema

## Architecture

```
@rogue/auth (packages/auth)
├── Server (Elysia)    → Redis + DB
├── Client (Next.js)   → DB only
└── Shared Schema      → PostgreSQL
```

## Installation

This package is already installed as a workspace dependency. For Redis support:

```bash
# Server (required for Redis)
cd apps/server
bun add ioredis

# Client (optional - not using Redis currently)
# cd apps/client
# bun add ioredis
```

## Configuration

### Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:password@localhost:5432/rogue
SERVER_URL=http://localhost:3002
CLIENT_URL=http://localhost:3000
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000

# Optional - Redis for session caching and rate limiting
REDIS_URL=redis://localhost:6379

# Production
NODE_ENV=production
```

### Server Setup (Elysia)

```typescript
// apps/server/src/infra/auth/index.ts
import { createAuth, createRedisStorage, schema } from "@rogue/auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../database";

const redis = createRedisStorage(process.env.REDIS_URL);

export const auth = createAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  baseURL: process.env.SERVER_URL,
  redis,                          // ✅ Enables secondary storage
  enableRateLimiting: !!redis,    // ✅ Enables rate limiting if Redis available
});
```

### Client Setup (Next.js)

```typescript
// apps/client/src/lib/auth.ts
import { createAuth, schema } from "@rogue/auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5, // Reduced - Redis handles caching server-side
});

const db = drizzle(pool, { schema });

export const auth = createAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  baseURL: process.env.NEXT_PUBLIC_APP_ORIGIN,
  plugins: [nextCookies()],
});
```

## Redis Configuration

### What Redis Caches

When Redis is enabled (server-side only), it stores:

- **Sessions**: After initial DB query, cached for 1 hour
- **Rate Limit Counters**: Sliding window counters
- **Verification Tokens**: Email/password reset tokens

### Performance Impact

| Scenario | Without Redis | With Redis | Improvement |
|----------|--------------|------------|-------------|
| Fresh login | ~50-100ms (DB) | ~50-100ms (DB) | - |
| Cookie cache hit (< 5 min) | ~0ms (local) | ~0ms (local) | - |
| Cookie expired (> 5 min) | ~50-100ms (DB) | ~5-10ms (Redis) | **10x faster** |
| High traffic (1000 req/s) | High DB load | Low DB load | **Scalable** |

### Cache Layers

```
Request → Cookie Cache (5 min) → Redis Cache (1 hour) → Database
          ↓                       ↓                       ↓
          0ms latency            ~5ms latency            ~50ms latency
```

### Rate Limiting Rules

When Redis is enabled:

```typescript
// Default configuration (from packages/auth/src/config.ts)
RATE_LIMIT: {
  GLOBAL: { WINDOW: 60, MAX: 100 },        // 100 requests/minute globally
  SIGN_IN: { WINDOW: 60, MAX: 5 },         // 5 attempts/minute
  SIGN_UP: { WINDOW: 60, MAX: 3 },         // 3 attempts/minute
  RESET_PASSWORD: { WINDOW: 300, MAX: 3 }, // 3 attempts/5 minutes
}
```

## Health Check

The server exposes a health endpoint that includes Redis status:

```bash
curl http://localhost:3002/health

# Response
{
  "status": "ok",
  "uptime": 123.456,
  "services": {
    "redis": "connected"  // or "disabled" if Redis not configured
  }
}
```

## Redis Helper Functions

### Check Redis Health

```typescript
import { checkRedisHealth, createRedisStorage } from "@rogue/auth";

const redis = createRedisStorage(process.env.REDIS_URL);
const isHealthy = await checkRedisHealth(redis);

console.log("Redis status:", isHealthy ? "OK" : "Down");
```

### Manual Redis Operations

```typescript
import type { RedisStorage } from "@rogue/auth";

const redis: RedisStorage = createRedisStorage(process.env.REDIS_URL);

// Get
const value = await redis.get("session:abc123");

// Set with TTL
await redis.set("session:abc123", JSON.stringify(sessionData), 3600); // 1 hour

// Delete
await redis.delete("session:abc123");
```

## Troubleshooting

### Redis Connection Issues

**Symptom**: `[Auth Redis] Connection error: ECONNREFUSED`

**Solution**:
```bash
# Start Redis locally
docker run -d -p 6379:6379 redis:7-alpine

# Or install natively
brew install redis  # macOS
redis-server       # Start server
```

### Redis Not Used (Even When Configured)

**Symptom**: Sessions always hit database

**Check**:
1. Verify `REDIS_URL` is set in `.env`
2. Check server logs for `[Auth Redis] Connected successfully`
3. Check health endpoint: `curl http://localhost:3002/health`

### Rate Limiting Not Working

**Requirements**:
- Redis must be connected
- `enableRateLimiting: true` must be set
- Both conditions checked automatically: `enableRateLimiting: !!redis`

## TypeScript Types

```typescript
import type {
  AuthConfig,
  AuthInstance,
  CreateAuthOptions,
  RedisStorage,
  Session,
  User,
} from "@rogue/auth";

// Inferred from auth instance
const auth = createAuth({...});
type MySession = typeof auth.$Infer.Session;
type MyUser = typeof auth.$Infer.Session.user;
```

## Development vs Production

| Feature | Development | Production |
|---------|------------|------------|
| **Redis** | Optional (graceful fallback) | Recommended |
| **Secure Cookies** | `false` | `true` (auto-detected) |
| **CORS Origin Check** | Disabled | Enabled |
| **Rate Limiting** | Optional | Recommended |
| **Cookie Cache** | Enabled (5 min) | Enabled (5 min) |

## Migration from Better Auth Docs

If you're following Better Auth documentation:

```typescript
// ❌ Better Auth docs (single app)
import { betterAuth } from "better-auth";
const auth = betterAuth({ database, ... });

// ✅ Rogue III (shared package)
import { createAuth } from "@rogue/auth";
const auth = createAuth({ database, ... });
```

## Links

- [Better Auth Documentation](https://better-auth.com)
- [Redis Documentation](https://redis.io/docs/)
- [Project README](../../README.md)

## License

Private - Rogue III Project
