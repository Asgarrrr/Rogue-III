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

type ConfigInput = {
  width?: number;
  height?: number;
  roomCount?: number;
  roomSizeRange?: [number, number];
  algorithm?: "cellular" | "bsp";
};

function buildShareCode(dungeon: Dungeon): string | undefined {
  const code = SeedManager.encodeSeed(dungeon.seeds);
  return code.isErr() ? undefined : code.value;
}

function resolveConfig(partial?: ConfigInput) {
  return buildDungeonConfig({
    width: partial?.width ?? 60,
    height: partial?.height ?? 40,
    roomCount: partial?.roomCount ?? (partial?.algorithm === "bsp" ? 8 : 6),
    roomSizeRange: partial?.roomSizeRange ?? [5, 12],
    algorithm: partial?.algorithm ?? "cellular",
  });
}

type GenerationSuccess = { ok: true; dungeon: Dungeon };
type GenerationError = {
  ok: false;
  error: { code: string; message: string; details?: Record<string, unknown> };
};
type GenerationResult = GenerationSuccess | GenerationError;

function generateDungeon(
  seed: number | string,
  shareCode: string | undefined,
  partial?: ConfigInput,
): GenerationResult {
  const validated = resolveConfig(partial);
  if (!validated.success) {
    return {
      ok: false,
      error: {
        code: "CONFIG_INVALID",
        message: "Invalid configuration",
        details: {
          issues: (validated.error as { issues: unknown[] }).issues,
        },
      },
    };
  }

  const dungeonResult = shareCode
    ? DungeonManager.regenerateFromCode(shareCode, validated.value)
    : DungeonManager.generateFromSeedSync(seed, validated.value);

  if (dungeonResult.isErr()) {
    return {
      ok: false,
      error: {
        code: dungeonResult.error.code,
        message: dungeonResult.error.message,
        details: dungeonResult.error.details,
      },
    };
  }

  return { ok: true, dungeon: dungeonResult.value };
}

export const createApp = () =>
  new Elysia()
    .options(
      "/api/*",
      () => new Response(null, { status: 204, headers: addCors() }),
    )
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
    .get("/api/dungeon/preview", ({ query, set }) => {
      const params = (query ?? {}) as Record<string, string>;
      const seed = params.seed ? Number(params.seed) : 1;
      const shareCode =
        typeof params.shareCode === "string" && params.shareCode.length > 0
          ? params.shareCode
          : undefined;
      const partial: ConfigInput = {
        width: params.width ? Number(params.width) : undefined,
        height: params.height ? Number(params.height) : undefined,
        roomCount: params.roomCount ? Number(params.roomCount) : undefined,
        roomSizeRange:
          params.minRoom && params.maxRoom
            ? [Number(params.minRoom), Number(params.maxRoom)]
            : undefined,
        algorithm:
          params.algorithm === "bsp" || params.algorithm === "cellular"
            ? params.algorithm
            : undefined,
      };

      const generation = generateDungeon(seed, shareCode, partial);

      if (!generation.ok) {
        set.status = 400;
        set.headers = addCors();
        return {
          ok: false,
          error: generation.error.code ?? "GENERATION_FAILED",
          message: generation.error.message ?? "Unable to generate dungeon",
          details: generation.error.details,
        };
      }

      const dungeon = generation.dungeon;
      set.headers = addCors({ "Content-Type": "text/plain" });
      return gridToAscii(dungeon.grid);
    })
    .post("/api/dungeon", ({ body, set }) => {
      const {
        seed = 1,
        shareCode,
        config,
      } = (body ?? {}) as {
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

      const generation = generateDungeon(seed, shareCode, config);

      if (!generation.ok) {
        set.status = 400;
        set.headers = addCors();
        return {
          ok: false,
          error: generation.error.code ?? "GENERATION_FAILED",
          message: generation.error.message ?? "Unable to generate dungeon",
          details: generation.error.details,
        };
      }

      const dungeon = generation.dungeon;
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
    });

export type RogueApp = ReturnType<typeof createApp>;
