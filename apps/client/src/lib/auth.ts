import { createAuth, createRedisStorage, schema } from "@rogue/auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const db = drizzle(pool, { schema });
const redis = await createRedisStorage(process.env.REDIS_URL);

export const auth = createAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  baseURL: process.env.CLIENT_URL,
  plugins: [nextCookies()],
  redis,
  enableRateLimiting: !!redis,
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
