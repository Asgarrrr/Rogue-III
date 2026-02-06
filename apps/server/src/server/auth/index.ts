import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, oneTimeToken } from "better-auth/plugins";
import { db } from "../db";
import * as schema from "../db/schema";
import { isDev } from "../utils/env";
import { createRedisStorage } from "./redis";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3000";
const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:5173";

export const redis = await createRedisStorage(process.env.REDIS_URL);

if (!redis && !isDev()) {
  console.error("[Auth] Redis storage is required in production mode.");
  process.exit(1);
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  basePath: "/api/auth",
  baseURL: SERVER_URL,
  trustedOrigins: [CLIENT_URL, SERVER_URL],

  ...(redis && {
    secondaryStorage: {
      get: redis.get,
      set: redis.set,
      delete: redis.delete,
    },
  }),

  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },

  advanced: {
    cookiePrefix: "rogue",
    useSecureCookies: !isDev() && SERVER_URL.startsWith("https"),
    crossSubDomainCookies: { enabled: !isDev() },
    generateSessionToken: true,
    disableOriginCheck: isDev(),
  },

  cookie: {
    sameSite: "lax",
    httpOnly: true,
    path: "/",
  },

  rateLimit: {
    enabled: true,
    storage: redis ? "secondary-storage" : "memory",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/*": { window: 60, max: 5 },
      "/sign-up/*": { window: 60, max: 3 },
      "/forgot-password": { window: 300, max: 3 },
    },
  },

  plugins: [bearer(), oneTimeToken({ expiresIn: 60 })],
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
export type User = Session["user"];
