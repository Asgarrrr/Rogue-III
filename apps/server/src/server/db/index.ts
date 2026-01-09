import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  allowExitOnIdle: false,
});

pool.on("error", (err) => {
  if (process.env.NODE_ENV !== "production") {
    console.warn("[Database]", err.message);
  }
});

export const db = drizzle(pool, {
  schema,
  logger: process.env.NODE_ENV === "development",
});
