# Auth Refacto Plan - State of the Art

**Date:** 2026-01-08
**Status:** Draft
**Scope:** Backend + Frontend auth avec Better-Auth

---

## Objectifs

1. **Rate limiting** : Redis only, graceful fallback si indisponible
2. **Elysia macro** : Routes protégées avec `{ auth: true }`
3. **WebSocket auth** : Direct API call (pas HTTP fetch)
4. **Client auth** : Better-Auth React avec hooks
5. **Auth UI** : Pages minimales sign-in / sign-up

---

## Architecture Cible

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (React)                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  auth-client.ts                                          │  │
│  │  - createAuthClient() from "better-auth/react"           │  │
│  │  - oneTimeTokenClient() plugin                           │  │
│  │  - useSession() hook                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│  ┌──────────────┐  ┌─────────▼─────────┐  ┌────────────────┐  │
│  │  /sign-in    │  │  useSession()     │  │  useGameAuth() │  │
│  │  /sign-up    │  │  - data.user      │  │  - getWSToken  │  │
│  │              │  │  - isPending      │  │  - connect()   │  │
│  └──────────────┘  └───────────────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                    HTTP (credentials: include)
                    WS (token in query param)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SERVER (Elysia + Bun)                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  server/auth/index.ts                                    │  │
│  │  - betterAuth() with Drizzle adapter                     │  │
│  │  - Plugins: bearer(), oneTimeToken()                     │  │
│  │  - Redis secondary storage (optional)                    │  │
│  │  - Rate limiting (Redis only, disabled if unavailable)   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│  ┌──────────────────────────▼───────────────────────────────┐  │
│  │  server/api/index.ts - Elysia App                        │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  betterAuthPlugin (macro)                          │  │  │
│  │  │  - .mount(auth.handler)                            │  │  │
│  │  │  - .macro({ auth: { resolve() } })                 │  │  │
│  │  │  - Expose: user, session in context                │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                                          │  │
│  │  Routes:                                                 │  │
│  │  - GET /health                                           │  │
│  │  - GET /api/me            { auth: true }                 │  │
│  │  - WS  /ws/game           (custom auth via derive)       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│  ┌──────────────────────────▼───────────────────────────────┐  │
│  │  server/ws/index.ts - WebSocket                          │  │
│  │  - Cookie auth: auth.api.getSession({ headers })         │  │
│  │  - Token auth: auth.api.verifyOneTimeToken({ body })     │  │
│  │  - NO HTTP fetch (direct API call)                       │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Backend - Simplifier Auth Config

### 1.1 Refacto `create-auth.ts`

**Changements:**
- Supprimer `enableRateLimiting` param (Redis = enabled, pas Redis = disabled)
- Rate limit storage: `secondary-storage` si Redis dispo
- Simplifier la config en inline (moins de niveaux d'abstraction)

```typescript
// server/auth/index.ts (simplifié)
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  baseURL: process.env.SERVER_URL,
  
  // Secondary storage = Redis (sessions + rate limit)
  ...(redis && { secondaryStorage: redis }),
  
  // Rate limiting (Redis only)
  rateLimit: redis ? {
    enabled: true,
    storage: "secondary-storage",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/*": { window: 60, max: 5 },
      "/sign-up/*": { window: 60, max: 3 },
    },
  } : { enabled: false },
  
  // ... rest
});
```

### 1.2 Supprimer `config.ts` 

Trop de niveaux. Inline les valeurs directement ou utiliser des constantes simples.

### 1.3 Fichiers à modifier

| Fichier | Action |
|---------|--------|
| `server/auth/index.ts` | Refacto complet, inline config |
| `server/auth/create-auth.ts` | Supprimer (merge dans index.ts) |
| `server/auth/config.ts` | Supprimer |
| `server/auth/redis.ts` | Garder, simplifier interface |

---

## Phase 2: Backend - Elysia Macro Auth

### 2.1 Créer plugin `betterAuthPlugin`

```typescript
// server/auth/plugin.ts
import { Elysia } from "elysia";
import { auth } from "./index";

export const betterAuthPlugin = new Elysia({ name: "better-auth" })
  .mount(auth.handler)
  .macro({
    auth: {
      async resolve({ status, request: { headers } }) {
        const session = await auth.api.getSession({ headers });
        if (!session) return status(401);
        return {
          user: session.user,
          session: session.session,
        };
      },
    },
  });
```

### 2.2 Usage dans routes

```typescript
// server/api/index.ts
app
  .use(betterAuthPlugin)
  .get("/api/me", ({ user }) => user, { auth: true })
```

### 2.3 Fichiers à créer/modifier

| Fichier | Action |
|---------|--------|
| `server/auth/plugin.ts` | Créer - Elysia macro |
| `server/api/index.ts` | Refacto - utiliser plugin |

---

## Phase 3: Backend - WebSocket Auth Direct

### 3.1 Supprimer HTTP fetch

**Avant (mauvais):**
```typescript
const response = await fetch(`${baseUrl}/api/auth/one-time-token/verify`, ...);
```

**Après (bon):**
```typescript
const result = await auth.api.verifyOneTimeToken({
  body: { token },
});
```

### 3.2 Fichiers à modifier

| Fichier | Action |
|---------|--------|
| `server/ws/index.ts` | Refacto - direct API call |

---

## Phase 4: Frontend - Auth Client

### 4.1 Créer auth-client.ts

```typescript
// apps/client/src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";
import { oneTimeTokenClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: import.meta.env.DEV 
    ? "http://localhost:3000" 
    : window.location.origin,
  plugins: [
    oneTimeTokenClient(),
  ],
});

// Export hooks
export const { useSession, signIn, signUp, signOut } = authClient;
```

### 4.2 Créer hook useGameAuth

```typescript
// apps/client/src/hooks/use-game-auth.ts
import { useSession, authClient } from "@/lib/auth-client";

export function useGameAuth() {
  const session = useSession();
  
  const getWebSocketToken = async () => {
    if (!session.data) throw new Error("Not authenticated");
    const { data } = await authClient.oneTimeToken.generate({});
    return data?.token;
  };
  
  const connectToGame = async () => {
    const token = await getWebSocketToken();
    const wsUrl = `${import.meta.env.VITE_WS_URL}/ws/game?token=${token}`;
    return new WebSocket(wsUrl);
  };
  
  return {
    session,
    isAuthenticated: !!session.data,
    getWebSocketToken,
    connectToGame,
  };
}
```

### 4.3 Fichiers à créer

| Fichier | Action |
|---------|--------|
| `client/src/lib/auth-client.ts` | Créer |
| `client/src/hooks/use-game-auth.ts` | Créer |

---

## Phase 5: Frontend - Auth Pages

### 5.1 Structure pages

```
apps/client/src/
├── pages/
│   ├── sign-in.tsx
│   └── sign-up.tsx
├── components/
│   └── auth/
│       ├── auth-form.tsx      # Shared form logic
│       └── protected-route.tsx
```

### 5.2 Sign In Page (minimal)

```tsx
// pages/sign-in.tsx
export function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await signIn.email({ email, password });
    if (error) setError(error.message);
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input type="email" value={email} onChange={...} />
      <input type="password" value={password} onChange={...} />
      {error && <p className="text-red-500">{error}</p>}
      <button type="submit">Sign In</button>
    </form>
  );
}
```

### 5.3 Protected Route

```tsx
// components/auth/protected-route.tsx
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  
  if (isPending) return <div>Loading...</div>;
  if (!session) return <Navigate to="/sign-in" />;
  
  return <>{children}</>;
}
```

### 5.4 Fichiers à créer

| Fichier | Action |
|---------|--------|
| `client/src/pages/sign-in.tsx` | Créer |
| `client/src/pages/sign-up.tsx` | Créer |
| `client/src/components/auth/protected-route.tsx` | Créer |

---

## Phase 6: CORS Fix

### 6.1 Ajouter Authorization header

```typescript
cors({
  origin: [process.env.CLIENT_URL],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  exposeHeaders: ["Set-Cookie"],
})
```

---

## Ordre d'Exécution

### Backend (Phases 1-3, 6)

1. **Backend auth refacto** (Phase 1)
   - [ ] Simplifier `server/auth/index.ts` - inline config
   - [ ] Supprimer `create-auth.ts` et `config.ts`
   - [ ] Garder `redis.ts` simplifié

2. **Elysia macro** (Phase 2)
   - [ ] Créer `server/auth/plugin.ts`
   - [ ] Refacto `server/api/index.ts`
   - [ ] Ajouter route `/api/me` pour test

3. **WebSocket auth** (Phase 3)
   - [ ] Refacto `server/ws/index.ts` - direct API call

4. **CORS fix** (Phase 6)
   - [ ] Ajouter `Authorization` header

### Frontend (Phases 4-5, 7)

5. **TanStack Router** (Phase 7)
   - [ ] `bun add @tanstack/react-router`
   - [ ] Créer `lib/router.ts`
   - [ ] Créer routes structure

6. **Auth client** (Phase 4)
   - [ ] Créer `lib/auth-client.ts`
   - [ ] Créer `hooks/use-game-auth.ts`

7. **Auth pages** (Phase 5)
   - [ ] `routes/sign-in.tsx`
   - [ ] `routes/sign-up.tsx`
   - [ ] `routes/game.tsx` (protected)

### Validation

8. **Test E2E**
   - [ ] Sign up → redirect to game
   - [ ] Sign in → redirect to game
   - [ ] /game without auth → redirect to sign-in
   - [ ] WebSocket connect with token
   - [ ] Rate limiting (avec Redis)

---

## Risques & Mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Breaking change session format | Sessions existantes invalides | Cookie cache invalidation via version bump |
| Redis down en prod | Pas de rate limiting | Acceptable (graceful degradation) |
| CORS issues cross-origin | WS auth échoue | One-time token fallback |

---

## Décisions

1. **Routing client** : TanStack Router (type-safe, moderne)
2. **Email verification** : Plus tard (pas bloquant pour MVP)
3. **Session refresh WS** : Plus tard (sessions 7 jours suffisent)

---

## Phase 7: TanStack Router Setup

### 7.1 Installation

```bash
cd apps/client
bun add @tanstack/react-router
```

### 7.2 Structure routes

```
apps/client/src/
├── routes/
│   ├── __root.tsx        # Layout racine + AuthProvider
│   ├── index.tsx         # / → redirect vers /game si auth, sinon /sign-in
│   ├── sign-in.tsx       # /sign-in
│   ├── sign-up.tsx       # /sign-up  
│   └── game.tsx          # /game (protected)
├── lib/
│   ├── auth-client.ts
│   └── router.ts         # Router instance
└── main.tsx              # RouterProvider
```

### 7.3 Router config

```typescript
// lib/router.ts
import { createRouter, createRootRoute, createRoute } from "@tanstack/react-router";
import { Root } from "@/routes/__root";
import { SignInPage } from "@/routes/sign-in";
import { SignUpPage } from "@/routes/sign-up";
import { GamePage } from "@/routes/game";

const rootRoute = createRootRoute({ component: Root });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: IndexRedirect,
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in",
  component: SignInPage,
});

const signUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-up",
  component: SignUpPage,
});

const gameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/game",
  component: GamePage,
  beforeLoad: async ({ context }) => {
    // Protected route check
    if (!context.auth.session) {
      throw redirect({ to: "/sign-in" });
    }
  },
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  signUpRoute,
  gameRoute,
]);

export const router = createRouter({ 
  routeTree,
  context: { auth: undefined! }, // Injected in main.tsx
});
```

### 7.4 Root layout avec auth context

```typescript
// routes/__root.tsx
import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import type { AuthContext } from "@/lib/auth-client";

interface RouterContext {
  auth: AuthContext;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Root,
});

function Root() {
  return (
    <div className="min-h-screen">
      <Outlet />
    </div>
  );
}
```

### 7.5 Fichiers à créer

| Fichier | Action |
|---------|--------|
| `client/src/lib/router.ts` | Créer - Router config |
| `client/src/routes/__root.tsx` | Créer - Root layout |
| `client/src/routes/index.tsx` | Créer - Index redirect |
| `client/src/routes/sign-in.tsx` | Créer - Sign in page |
| `client/src/routes/sign-up.tsx` | Créer - Sign up page |
| `client/src/routes/game.tsx` | Créer - Game page (protected) |
| `client/src/main.tsx` | Modifier - RouterProvider |
