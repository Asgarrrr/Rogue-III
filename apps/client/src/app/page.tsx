import { treaty } from "@elysiajs/eden";
import type { App } from "@rogue/server";

export default function Home() {
  const api = treaty<App>("http://localhost:3001");

  api.get().then((res) => console.log(res));

  process.env.BETTER_AUTH_SECRET;

  return (
    <main>
      <p>Welcome to Rogue III!</p>
    </main>
  );
}
