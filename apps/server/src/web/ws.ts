import { Elysia } from "elysia";
import { auth } from "../infra/auth";

export const wsRoutes = new Elysia({ name: "ws" }).ws("/ws/game", {
  async beforeHandle({ request, set }) {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    // @ts-expect-error - attach userId for handlers
    request.userId = session.user.id;
  },

  open(ws) {
    // @ts-expect-error
    const userId = ws.data.request?.userId as string;
    console.log(`[WS] ${userId} connected`);
  },

  message(ws, message) {
    // @ts-expect-error
    const userId = ws.data.request?.userId as string;
    ws.send(JSON.stringify({ type: "echo", userId, message }));
  },

  close(ws) {
    // @ts-expect-error
    const userId = ws.data.request?.userId as string;
    console.log(`[WS] ${userId} disconnected`);
  },
});
