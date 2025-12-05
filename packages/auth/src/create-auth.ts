import type { BetterAuthPlugin } from "better-auth";
import { betterAuth } from "better-auth";
import { AUTH_CONFIG } from "./config";

export type RedisStorage = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: string, ttl?: number) => Promise<void>;
  delete: (key: string) => Promise<void>;
};

export type CreateAuthOptions = {
  database: Parameters<typeof betterAuth>[0]["database"];
  baseURL: string;
  trustedOrigins?: string[];
  plugins?: BetterAuthPlugin[];
  redis?: RedisStorage;
  enableRateLimiting?: boolean;
};

export function createAuth(options: CreateAuthOptions) {
  const {
    database,
    baseURL,
    trustedOrigins = [],
    plugins = [],
    redis,
    enableRateLimiting = false,
  } = options;

  const useSecureCookies =
    AUTH_CONFIG.SECURITY.USE_SECURE_COOKIES && baseURL.startsWith("https");

  return betterAuth({
    database,

    ...(redis && {
      secondaryStorage: {
        get: redis.get,
        set: redis.set,
        delete: redis.delete,
      },
    }),

    basePath: AUTH_CONFIG.URLS.BASE_PATH,
    baseURL,
    trustedOrigins: [
      ...new Set([
        AUTH_CONFIG.URLS.CLIENT,
        AUTH_CONFIG.URLS.SERVER,
        ...trustedOrigins,
      ]),
    ],

    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: AUTH_CONFIG.PASSWORD.MIN_LENGTH,
      maxPasswordLength: AUTH_CONFIG.PASSWORD.MAX_LENGTH,
    },

    session: {
      expiresIn: AUTH_CONFIG.SESSION.DURATION,
      updateAge: AUTH_CONFIG.SESSION.UPDATE_AGE,
      cookieCache: {
        enabled: true,
        maxAge: AUTH_CONFIG.SESSION.CACHE_AGE,
      },
    },

    advanced: {
      cookiePrefix: AUTH_CONFIG.COOKIE.PREFIX,
      crossSubDomainCookies: {
        enabled:
          process.env.NODE_ENV === "production" &&
          AUTH_CONFIG.SECURITY.ENABLE_CROSS_SUBDOMAIN,
      },
      useSecureCookies,
      generateSessionToken: true,
      disableOriginCheck: process.env.NODE_ENV !== "production",
    },

    cookie: {
      sameSite: "lax",
      secure: useSecureCookies,
      httpOnly: true,
      domain: process.env.NODE_ENV === "production" ? undefined : "localhost",
      path: "/",
    },

    rateLimit:
      enableRateLimiting && redis
        ? {
            enabled: true,
            window: AUTH_CONFIG.RATE_LIMIT.GLOBAL.WINDOW,
            max: AUTH_CONFIG.RATE_LIMIT.GLOBAL.MAX,
            customStorage: {
              get: async (key: string) => {
                const value = await redis.get(`ratelimit:${key}`);
                return value ? JSON.parse(value as string) : null;
              },
              set: async (key: string, value: unknown) => {
                await redis.set(
                  `ratelimit:${key}`,
                  JSON.stringify(value),
                  AUTH_CONFIG.RATE_LIMIT.GLOBAL.WINDOW,
                );
              },
            },
            customRules: {
              "/sign-in/email": {
                window: AUTH_CONFIG.RATE_LIMIT.SIGN_IN.WINDOW,
                max: AUTH_CONFIG.RATE_LIMIT.SIGN_IN.MAX,
              },
              "/sign-up/email": {
                window: AUTH_CONFIG.RATE_LIMIT.SIGN_UP.WINDOW,
                max: AUTH_CONFIG.RATE_LIMIT.SIGN_UP.MAX,
              },
              "/reset-password": {
                window: AUTH_CONFIG.RATE_LIMIT.RESET_PASSWORD.WINDOW,
                max: AUTH_CONFIG.RATE_LIMIT.RESET_PASSWORD.MAX,
              },
            },
          }
        : { enabled: false },

    plugins,

    experimental: {
      joins: true,
    },
  });
}

export type AuthInstance = ReturnType<typeof createAuth>;
export type Session = AuthInstance["$Infer"]["Session"];
export type User = Session["user"];
