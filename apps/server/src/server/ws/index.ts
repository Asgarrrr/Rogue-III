import { randomBytes } from "node:crypto";
import { Elysia } from "elysia";
import { getGameInstance } from "../../game/game-init";
import { auth } from "../auth";

function generateSessionId(): string {
  return `sess_${randomBytes(16).toString("base64url")}`;
}

const WS_CONFIG = {
  perMessageDeflate: true,
  maxPayloadLength: 1024 * 1024,
  idleTimeout: 300,
  sendPings: true,
} as const;

async function verifyOneTimeToken(
  token: string,
): Promise<{ session: unknown; user: { id: string } } | null> {
  try {
    const result = await auth.api.verifyOneTimeToken({
      body: { token },
    });
    if (!result) return null;
    return result as { session: unknown; user: { id: string } };
  } catch (error) {
    console.error("[WS Auth] Token verification failed:", error);
    return null;
  }
}

export const wsRoutes = new Elysia({ name: "ws" })
  .derive(async ({ request }) => {
    const url = new URL(request.url);
    const tokenFromQuery = url.searchParams.get("token");

    const cookieSession = await auth.api.getSession({
      headers: request.headers,
    });

    let userId: string | undefined = cookieSession?.user?.id;

    if (!userId && tokenFromQuery) {
      const decodedToken = decodeURIComponent(tokenFromQuery);
      const tokenSession = await verifyOneTimeToken(decodedToken);
      userId = tokenSession?.user?.id;
    }

    return {
      userId,
      gameSessionId: userId ? generateSessionId() : undefined,
    };
  })
  .ws("/ws/game", {
    perMessageDeflate: WS_CONFIG.perMessageDeflate,
    maxPayloadLength: WS_CONFIG.maxPayloadLength,
    idleTimeout: WS_CONFIG.idleTimeout,
    sendPings: WS_CONFIG.sendPings,

    async beforeHandle({ userId, set }) {
      if (!userId) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
    },

    open(ws) {
      const userId = ws.data.userId;
      const sessionId = ws.data.gameSessionId;

      if (!userId || !sessionId) {
        console.error("[WS] Missing userId or sessionId");
        ws.close();
        return;
      }

      console.log(`[WS] Connected: user=${userId}, session=${sessionId}`);

      try {
        const { gameServer } = getGameInstance();
        const wsAdapter = {
          send: (data: string) => {
            try {
              ws.send(data);
            } catch (err) {
              console.error("[WS] Send failed:", err);
            }
          },
          close: () => {
            try {
              ws.close();
            } catch {}
          },
        };

        gameServer.handleConnect(sessionId, userId, wsAdapter);
      } catch (error) {
        console.error("[WS] Connection setup error:", error);
        ws.send(
          JSON.stringify({
            t: "error",
            code: "INTERNAL_ERROR",
            msg: "Failed to initialize",
          }),
        );
        ws.close();
      }
    },

    message(ws, message) {
      const sessionId = ws.data.gameSessionId;
      if (!sessionId) return;

      try {
        const { gameServer } = getGameInstance();
        let parsed: unknown;

        if (typeof message === "string") {
          try {
            parsed = JSON.parse(message);
          } catch {
            ws.send(
              JSON.stringify({
                t: "error",
                code: "INVALID_JSON",
                msg: "Invalid JSON",
              }),
            );
            return;
          }
        } else {
          parsed = message;
        }

        gameServer.handleMessage(sessionId, parsed);
      } catch (error) {
        console.error("[WS] Message error:", error);
        ws.send(
          JSON.stringify({
            t: "error",
            code: "INTERNAL_ERROR",
            msg: "Failed to process",
          }),
        );
      }
    },

    close(ws) {
      const { userId, gameSessionId } = ws.data;
      console.log(
        `[WS] Disconnected: user=${userId}, session=${gameSessionId}`,
      );

      if (!gameSessionId) return;

      try {
        const { gameServer } = getGameInstance();
        gameServer.handleDisconnect(gameSessionId);
      } catch (error) {
        console.error("[WS] Disconnect error:", error);
      }
    },
  });
