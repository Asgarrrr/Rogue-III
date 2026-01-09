import { useNavigate } from "@tanstack/react-router";
import { signOut, useSession } from "@/lib/auth-client";
import { useGameAuth } from "@/hooks/use-game-auth";

export function GamePage() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { connectToGame } = useGameAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/sign-in" });
  };

  const handleConnect = async () => {
    try {
      const ws = await connectToGame();
      ws.onopen = () => console.log("[Game] Connected");
      ws.onmessage = (e) => console.log("[Game] Message:", e.data);
      ws.onclose = () => console.log("[Game] Disconnected");
      ws.onerror = (e) => console.error("[Game] Error:", e);
    } catch (error) {
      console.error("[Game] Failed to connect:", error);
    }
  };

  return (
    <div className="min-h-screen p-4">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Rogue III</h1>
        <div className="flex items-center gap-4">
          <span className="text-zinc-400">{session?.user?.name}</span>
          <button
            type="button"
            onClick={handleSignOut}
            className="px-3 py-1 text-sm bg-zinc-800 rounded hover:bg-zinc-700"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex flex-col items-center justify-center gap-4">
        <p className="text-zinc-400">Game canvas will be rendered here</p>
        <button
          type="button"
          onClick={handleConnect}
          className="px-4 py-2 bg-zinc-100 text-zinc-900 font-medium rounded-md hover:bg-zinc-200"
        >
          Connect to Game Server
        </button>
      </main>
    </div>
  );
}
