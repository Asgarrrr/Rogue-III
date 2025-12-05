import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./src/infra/database/drizzle",
  schema: [
    // Auth schema from shared package (relative from server root)
    "../../packages/auth/src/schema/*.ts",
    // Server-specific schema
    "./src/infra/database/schema/*.ts",
  ],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
