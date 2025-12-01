// // import { createApp } from "./app";

// // const app = createApp();

// // if (process.env.NODE_ENV !== "test") {
// //   const port = Number(process.env.PORT ?? 3001);
// //   const hostname = process.env.HOST ?? "0.0.0.0";

// //   app.listen({ port, hostname });
// //   console.log(`🔌 Rogue III Server is running at ${hostname}:${port}`);
// // }

// // export type App = typeof app;

// import { openapi } from "@elysiajs/openapi";
// import { Elysia } from "elysia";
// import { auth } from "./lib/auth";

// const app = new Elysia()
//   .mount(auth.handler)
//   .get("*", () => "Rogue III API")
//   .use(
//     openapi({
//       enabled: process.env.NODE_ENV !== "production",
//     }),
//   )
//   .listen(3001);

// console.log(
//   `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
// );
