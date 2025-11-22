import { Elysia } from "elysia";
import { DungeonManager } from "./engine/dungeon";
import { buildDungeonConfig } from "./engine/dungeon/config/builder";
import type { Dungeon } from "./engine/dungeon/entities";
import { SeedManager } from "./engine/dungeon/serialization";

const addCors = (headers: Record<string, string> = {}) => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  ...headers,
});

function gridToAscii(grid?: boolean[][]): string {
  if (!grid) return "";
  return grid
    .map((row) => row.map((cell) => (cell ? "#" : ".")).join(""))
    .join("\n");
}

function buildShareCode(dungeon: Dungeon): string | undefined {
  const code = SeedManager.encodeSeed(dungeon.seeds);
  return code.isErr() ? undefined : code.value;
}

const app = new Elysia()
  .options("/api/*", () => new Response(null, { status: 204, headers: addCors() }))
  .get("/", () => ({
    message: "Bienvenue sur l'API Rogue III",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  }))
  .get("/api/health", () => ({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }))
  .get("/api/ping", () => "pong")
  .post(
    "/api/dungeon",
    ({ body, set }) => {
      const { seed = 1, shareCode, config } = (body ?? {}) as {
        seed?: number | string;
        shareCode?: string;
        config?: {
          width?: number;
          height?: number;
          roomCount?: number;
          roomSizeRange?: [number, number];
          algorithm?: "cellular" | "bsp";
        };
      };

      const mergedConfig = {
        width: config?.width ?? 60,
        height: config?.height ?? 40,
        roomCount: config?.roomCount ?? (config?.algorithm === "bsp" ? 8 : 6),
        roomSizeRange: config?.roomSizeRange ?? [5, 12],
        algorithm: config?.algorithm ?? "cellular",
      };

      const validated = buildDungeonConfig(mergedConfig);
      if (!validated.success) {
        set.status = 400;
        set.headers = addCors();
        return { ok: false, error: "CONFIG_INVALID", details: validated.error };
      }

      const dungeonResult = shareCode
        ? DungeonManager.regenerateFromCode(shareCode, validated.value)
        : DungeonManager.generateFromSeedSync(seed, validated.value);

      if (dungeonResult.isErr()) {
        set.status = 400;
        set.headers = addCors();
        return {
          ok: false,
          error: dungeonResult.error.code,
          message: dungeonResult.error.message,
          details: dungeonResult.error.details,
        };
      }

      const dungeon = dungeonResult.value;
      const share = shareCode ?? buildShareCode(dungeon);

      set.headers = addCors({ "Content-Type": "application/json" });
      return {
        ok: true,
        checksum: dungeon.checksum,
        config: dungeon.config,
        seeds: dungeon.seeds,
        shareCode: share,
        rooms: dungeon.rooms,
        connections: dungeon.connections,
        ascii: gridToAscii(dungeon.grid),
      };
    },
    { type: "json" },
  )
  .listen(3001);

console.log(
  `🎲 Rogue III Server is running at ${app.server?.hostname}:${app.server?.port}`,
);
