declare module "bun" {
  interface Env {
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_BASE_URL: string;

    DATABASE_URL: string;
  }
}
