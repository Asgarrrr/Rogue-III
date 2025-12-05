import { createAuth, createRedisStorage, schema } from "@rogue/auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../database";

export const redis = await createRedisStorage(process.env.REDIS_URL);

export const auth = createAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  baseURL: process.env.SERVER_URL,
  redis,
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
