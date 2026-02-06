import { Elysia } from "elysia";
import { auth } from "./index";

export const betterAuthPlugin = new Elysia({ name: "better-auth" })
  .all("/api/auth/*", async ({ request }) => {
    return auth.handler(request);
  })
  .macro({
    auth: {
      async resolve({ status, request: { headers } }) {
        const session = await auth.api.getSession({ headers });
        if (!session) return status(401);
        return {
          user: session.user,
          session: session.session,
        };
      },
    },
  });

export type BetterAuthPlugin = typeof betterAuthPlugin;
