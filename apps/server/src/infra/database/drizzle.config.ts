import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

const baseDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  out: path.join(baseDir, "drizzle"),
  schema: path.join(baseDir, "schema/*"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
