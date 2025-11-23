import { createApp } from "./app";

const app = createApp();

if (process.env.NODE_ENV !== "test") {
  app.listen(3001);
  console.log(
    `?? Rogue III Server is running at ${app.server?.hostname}:${app.server?.port}`,
  );
}

export type App = typeof app;
