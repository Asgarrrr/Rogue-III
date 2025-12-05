import { cron } from "@elysiajs/cron";
import { lt } from "drizzle-orm";
import { db } from "../infra/database";
import { session } from "../infra/database/schema";

async function cleanupExpiredSessions() {
  try {
    const result = await db
      .delete(session)
      .where(lt(session.expiresAt, new Date()));
    if (process.env.NODE_ENV !== "production" && result.rowCount) {
      console.log(`[Cleanup] ${result.rowCount} sessions`);
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[Cleanup]", err);
    }
  }
}

export const cleanupPlugin = cron({
  name: "cleanup",
  pattern: "0 * * * *",
  run: cleanupExpiredSessions,
});
