declare module "bun" {
  interface Env {
    // Database
    DATABASE_URL: string;

    // Server configuration
    SERVER_URL: string;
    CLIENT_URL: string;
    SERVER_HOST: string;
    SERVER_PORT: string;

    // Redis (optional)
    REDIS_URL?: string;

    // Performance profiling (optional)
    PERF_PROFILE?: "fast" | "balanced" | "quality";

    // Node environment
    NODE_ENV: "development" | "production" | "test";
  }
}
