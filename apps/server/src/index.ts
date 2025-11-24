import { createApp } from "./app";

const app = createApp();

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3001);
  const hostname = process.env.HOST ?? "0.0.0.0";

  app.listen({ port, hostname });
  console.log(`🔌 Rogue III Server is running at ${hostname}:${port}`);
}

export type App = typeof app;
