import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";

const app = new Elysia()
	.use(
		cors({
			origin: "http://localhost:5173",
			methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
			credentials: true,
			allowedHeaders: ["Content-Type", "Authorization"],
		})
	)
	.get("/", () => {
		console.log("get /");
		return "Hi Elysia";
	})
	.get("/id/:id", ({ params: { id } }) => id)
	.post("/mirror", ({ body }) => body, {
		body: t.Object({
			id: t.Number(),
			name: t.String(),
		}),
	})
	.listen(3000);

console.log(
	`🦊 Elysia Server is running at ${app.server?.hostname}:${app.server?.port}`
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

// // Components importés depuis l'ECS

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

// // Scheduler: ordonne l'exécution des systèmes
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
// 	`🦊 Rogue III Server is running at ${app.server?.hostname}:${app.server?.port}`
// );
