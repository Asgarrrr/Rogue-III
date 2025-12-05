export type { AuthConfig } from "./config";
// Config exports
export { AUTH_CONFIG } from "./config";
export type {
  AuthInstance,
  CreateAuthOptions,
  RedisStorage,
  Session,
  User,
} from "./create-auth";
export { createAuth } from "./create-auth";

// Redis exports
export { checkRedisHealth, createRedisStorage } from "./redis";

// Schema re-exports for convenience
export * as schema from "./schema";
