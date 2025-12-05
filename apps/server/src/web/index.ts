import { cors } from "@elysiajs/cors";
import { checkRedisHealth } from "@rogue/auth";
import { Elysia } from "elysia";
import { auth, redis } from "../infra/auth";
import { cleanupPlugin } from "../jobs/cleanup";
import { securityPlugin } from "./core/plugins/security.plugin";
import { wsRoutes } from "./ws";

export function createWebApp() {
  return new Elysia({ name: "web" })
    .use(securityPlugin)
    .use(cleanupPlugin)
    .use(
      cors({
        origin: [process.env.CLIENT_URL],
        credentials: true,
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Cookie"],
        exposeHeaders: ["Set-Cookie"],
        maxAge: 86400,
      }),
    )
    .mount(auth.handler)
    .use(wsRoutes)
    .get("/health", async () => {
      const redisHealthy = await checkRedisHealth(redis);
      return {
        status: "ok",
        uptime: process.uptime(),
        services: {
          redis: redisHealthy ? "connected" : "disabled",
        },
      };
    });
}

export function startWebApp() {
  const app = createWebApp();
  const port = Number(process.env.SERVER_PORT);

  app.listen({ port, hostname: process.env.SERVER_HOST });
  console.log(`Server running on :${port}`);

  return app;
}

export type WebApp = ReturnType<typeof createWebApp>;
