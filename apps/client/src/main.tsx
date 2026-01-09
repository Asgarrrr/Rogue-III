import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { useSession } from "@/lib/auth-client";
import { router } from "@/lib/router";
import { FullPageLoader } from "@/components/ui/loading-spinner";
import "./index.css";

function App() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <FullPageLoader message="Initializing..." />;
  }

  return (
    <RouterProvider
      router={router}
      context={{
        auth: {
          session,
          isLoading: isPending,
          isAuthenticated: !!session,
        },
      }}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
