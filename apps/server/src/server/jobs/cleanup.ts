import { cron } from "@elysiajs/cron";
import { lt } from "drizzle-orm";
import { db } from "../db";
import { session } from "../db/schema";
import { isProd } from "../utils/env";

const cleanupExpiredSessions = async () => {
  const result = await db
    .delete(session)
    .where(lt(session.expiresAt, new Date()));

  if (isProd() || !result.rowCount) return;

  console.log(`[Cleanup] ${result.rowCount} sessions`);
};

export const cleanupPlugin = cron({
  name: "cleanup",
  pattern: "0 * * * *",
  run: async () => {
    try {
      await cleanupExpiredSessions();
    } catch (err) {
      if (!isProd()) console.warn("[Cleanup]", err);
    }
  },
});
