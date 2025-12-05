import { startWebApp } from "./web";

export const app = startWebApp();

export type App = typeof app;
