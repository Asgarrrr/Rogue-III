import { useSession, authClient } from "@/lib/auth-client";

export function useGameAuth() {
  const session = useSession();

  const getWebSocketToken = async () => {
    if (!session.data) throw new Error("Not authenticated");
    const { data, error } = await authClient.oneTimeToken.generate({});
    if (error || !data?.token) throw new Error("Failed to generate token");
    return data.token;
  };

  const connectToGame = async () => {
    const token = await getWebSocketToken();
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost = import.meta.env.DEV
      ? "localhost:3000"
      : window.location.host;
    return new WebSocket(
      `${wsProtocol}//${wsHost}/ws/game?token=${encodeURIComponent(token)}`,
    );
  };

  return {
    session: session.data,
    isLoading: session.isPending,
    isAuthenticated: !!session.data,
    error: session.error,
    getWebSocketToken,
    connectToGame,
  };
}
