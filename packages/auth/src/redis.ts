import type { Redis } from "ioredis";
import type { RedisStorage } from "./create-auth";

export function createRedisStorage(url?: string): RedisStorage | undefined {
  if (!url) {
    console.info("[Auth] Redis URL not provided, secondary storage disabled");
    return undefined;
  }

  let redis: Redis;

  try {
    // Dynamic import to handle optional peer dependency
    const IORedis = require("ioredis");
    redis = new IORedis.default(url, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 3) return null;
        return Math.min(times * 50, 2000);
      },
      lazyConnect: false,
      enableReadyCheck: true,
    });

    redis.on("error", (err: Error) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[Auth Redis] Connection error:", err.message);
      }
    });

    redis.on("connect", () => {
      if (process.env.NODE_ENV !== "production") {
        console.info("[Auth Redis] Connected successfully");
      }
    });
  } catch {
    console.warn(
      "[Auth] ioredis not installed, Redis storage disabled. Install with: bun add ioredis",
    );
    return undefined;
  }

  return {
    get: async (key: string): Promise<unknown> => {
      try {
        const value = await redis.get(key);
        return value;
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[Auth Redis] Get error:", error);
        }
        return null;
      }
    },

    set: async (key: string, value: string, ttl?: number): Promise<void> => {
      try {
        if (ttl) {
          await redis.setex(key, ttl, value);
        } else {
          await redis.set(key, value);
        }
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[Auth Redis] Set error:", error);
        }
      }
    },

    delete: async (key: string): Promise<void> => {
      try {
        await redis.del(key);
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[Auth Redis] Delete error:", error);
        }
      }
    },
  };
}

/**
 * Helper to check if Redis is available and healthy
 */
export async function checkRedisHealth(
  storage: RedisStorage | undefined,
): Promise<boolean> {
  if (!storage) return false;

  try {
    const testKey = "__redis_health_check__";
    await storage.set(testKey, "ok", 5);
    const value = await storage.get(testKey);
    await storage.delete(testKey);
    return value === "ok";
  } catch {
    return false;
  }
}
