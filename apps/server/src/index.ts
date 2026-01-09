import { type createWebApp, startWebApp } from "./server/api";

export const app = startWebApp();

export type App = ReturnType<typeof createWebApp>;
