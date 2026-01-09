import { treaty } from "@elysiajs/eden";
import type { App } from "@rogue/server";

const baseUrl = import.meta.env.DEV
  ? "http://localhost:3000"
  : window.location.origin;

export const api = treaty<App>(baseUrl, {
  fetch: {
    credentials: "include",
  },
});
