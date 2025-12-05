declare module "bun" {
  interface Env {
    // Database
    DATABASE_URL: string;

    // URLs
    CLIENT_URL: string;
    CLIENT_PORT: string;
    SERVER_URL: string;

    // Node environment
    NODE_ENV: "development" | "production" | "test";
  }
}
