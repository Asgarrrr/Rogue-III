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

const app = new Elysia()
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
  })
  .listen(3001);

console.log(
  `?? Rogue III Server is running at ${app.server?.hostname}:${app.server?.port}`,
);

export type App = typeof app;

// import { Elysia } from "elysia";
// import {
// 	World,
// 	RngResource,
// 	SpatialIndexResource,
// 	runMovement,
// 	runSpatialSync,
// 	runCollision,
// 	Scheduler,
// 	R,
// 	Position,
// 	Velocity,
// } from "./engine/ecs";
// import { DungeonManager } from "./engine/dungeon";
// import { buildDungeonConfig } from "./engine/dungeon/config/builder";
// import { GridResource } from "./engine/ecs/resources";

// // Bootstrap ECS world (minimal demo)
// const world = new World();
// world.resources.set("rng", new RngResource(1234));

// // Components import�s depuis l'ECS

// // Generate a dungeon and register grid + spatial resources
// const dungeonConfigResult = buildDungeonConfig({
// 	algorithm: "cellular",
// 	width: 60,
// 	height: 30,
// 	roomCount: 8,
// });
// if (!dungeonConfigResult.success) {
// 	throw new Error("Invalid dungeon config");
// }
// const dungeon = DungeonManager.generateFromSeedSync(
// 	1234,
// 	dungeonConfigResult.value
// );
// if (!dungeon || !dungeon.grid) {
// 	throw new Error("Dungeon generation failed or no grid produced");
// }
// world.resources.set(
// 	"spatial",
// 	new SpatialIndexResource(1, dungeon.config.width, dungeon.config.height)
// );
// world.resources.set("grid", new GridResource(dungeon.grid));

// // Spawn an example entity
// const e = world.createEntity();
// // Spawn player in first room center if available
// const spawnX =
// 	dungeon.rooms.length > 0 ? Math.floor(dungeon.rooms[0]!.centerX) : 0;
// const spawnY =
// 	dungeon.rooms.length > 0 ? Math.floor(dungeon.rooms[0]!.centerY) : 0;
// world.add(e, Position, { x: spawnX, y: spawnY });
// world.add(e, Velocity, { x: 1, y: 0 });

// // Scheduler: ordonne l'ex�cution des syst�mes
// const scheduler = new Scheduler();
// scheduler.add(runMovement);
// scheduler.add(runCollision);
// scheduler.add(runSpatialSync);

// const app = new Elysia()
// 	.get("/", () => ({
// 		message: "Bienvenue sur l'API Rogue III",
// 		version: "0.1.0",
// 		timestamp: new Date().toISOString(),
// 	}))
// 	.get("/api/health", () => ({
// 		status: "ok",
// 		uptime: process.uptime(),
// 		timestamp: new Date().toISOString(),
// 	}))
// 	.get("/api/ping", () => "pong")
// 	.get("/api/ecs", () => {
// 		const pos = world.get(e, Position);
// 		const vel = world.get(e, Velocity);
// 		return { e, pos, vel, tick: world.tick };
// 	})
// 	.get("/api/step", () => {
// 		// Simple tick via scheduler (update -> postUpdate)
// 		scheduler.runPhase(
// 			"update",
// 			{ worldTick: world.tick, resources: {} },
// 			world
// 		);
// 		scheduler.runPhase(
// 			"postUpdate",
// 			{ worldTick: world.tick, resources: {} },
// 			world
// 		);
// 		world.nextTick();
// 		const pos = world.get(e, Position);
// 		return { e, pos, tick: world.tick };
// 	})
// 	.post("/api/step", () => {
// 		// Simple tick via scheduler (update -> postUpdate)
// 		scheduler.runPhase(
// 			"update",
// 			{ worldTick: world.tick, resources: {} },
// 			world
// 		);
// 		scheduler.runPhase(
// 			"postUpdate",
// 			{ worldTick: world.tick, resources: {} },
// 			world
// 		);
// 		world.nextTick();
// 		const pos = world.get(e, Position);
// 		return { e, pos, tick: world.tick };
// 	})
// 	.listen(3001);

// console.log(
// 	`?? Rogue III Server is running at ${app.server?.hostname}:${app.server?.port}`
// );
