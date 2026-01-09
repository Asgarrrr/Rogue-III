import { createRouter } from "@tanstack/react-router";
import { routeTree, type RouterContext } from "@/routes/__root";

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  context: {
    auth: undefined!,
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export type { RouterContext };
