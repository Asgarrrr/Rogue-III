import { Elysia } from "elysia";

const app = new Elysia()
  .get("/", () => ({
    message: "Bienvenue sur l'API Rogue III",
    version: "0.1.0",
    timestamp: new Date().toISOString()
  }))
  .get("/api/health", () => ({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  }))
  .get('/api/ping', () => "pong")
  .listen(3001);

console.log(
  `🦊 Rogue III Server is running at ${app.server?.hostname}:${app.server?.port}`
);
