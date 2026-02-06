# Server Infrastructure Knowledge Base

**Scope:** HTTP API, WebSocket, Auth, Database, Background Jobs

## Structure
```
server/
├── api/
│   ├── index.ts       # Elysia app (CORS, health, auth handler mount)
│   └── core/          # Security plugins
├── ws/
│   └── index.ts       # WebSocket gateway (/ws/game)
├── auth/
│   ├── index.ts       # Better-Auth instance
│   ├── create-auth.ts # Factory with plugins
│   ├── config.ts      # Session/cookie settings
│   └── redis.ts       # Optional session cache
├── db/
│   ├── index.ts       # PostgreSQL pool + Drizzle
│   ├── drizzle.config.ts
│   ├── schema/
│   │   ├── auth/      # user, session, account, verification
│   │   └── index.ts
│   └── drizzle/       # Migrations
└── jobs/
    └── cleanup.ts     # Cron: expired session cleanup
```

## Auth Flow

### HTTP (Same-Origin)
1. POST `/api/auth/sign-in/email`
2. Better-Auth validates, creates session
3. HTTP-only cookie set (7-day expiry)

### WebSocket (Cross-Origin)
1. Request one-time token via API
2. Connect: `ws://localhost:3000/ws/game?token=...`
3. Server verifies token, attaches userId
4. Token expires in 60s

## Database
```typescript
import { db } from "../server/db";
await db.delete(session).where(lt(session.expiresAt, new Date()));
```

**No Repository pattern** - Direct Drizzle queries

## Tables
| Table | Purpose |
|-------|---------|
| `user` | id, name, email, emailVerified, image |
| `session` | token, expiresAt, userId (FK), ipAddress |
| `account` | OAuth/credentials, provider tokens |
| `verification` | Email verification tokens |

## Migrations
```bash
cd apps/server
bunx --bun drizzle-kit generate --config src/server/db/drizzle.config.ts
bunx --bun drizzle-kit push --config src/server/db/drizzle.config.ts
```

## Redis (Optional)
- Session caching
- Rate limiting (disabled without Redis)
- Health check: `checkRedisHealth()`
