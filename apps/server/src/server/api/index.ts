import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { betterAuthPlugin } from "../auth/plugin";
import { redis } from "../auth";
import { checkRedisHealth } from "../auth/redis";
import { cleanupPlugin } from "../jobs/cleanup";
import { wsRoutes } from "../ws";
import { securityPlugin } from "./core/plugins/security.plugin";

const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:5173";

export function createWebApp() {
  return new Elysia()
    .use(securityPlugin)
    .use(cleanupPlugin)
    .use(
      cors({
        origin: [CLIENT_URL],
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
        exposeHeaders: ["Set-Cookie"],
        maxAge: 86400,
      }),
    )
    .use(betterAuthPlugin)
    .use(wsRoutes)
    .get("/", () => "Rogue III Server")
    .get("/health", async () => ({
      status: "ok",
      uptime: process.uptime(),
      services: {
        redis: (await checkRedisHealth(redis)) ? "connected" : "disabled",
      },
    }))
    .get("/api/me", ({ user }) => user, { auth: true });
}

export function startWebApp() {
  const app = createWebApp();
  const port = Number(process.env.SERVER_PORT) || 3000;
  const host = process.env.SERVER_HOST || "0.0.0.0";

  app.listen({ port, hostname: host });
  console.log(`Server running on ${host}:${port}`);

  return app;
}

export type WebApp = ReturnType<typeof createWebApp>;
