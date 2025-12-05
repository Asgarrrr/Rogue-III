"use client";

import { useRouter } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await signOutAction();
    router.refresh();
  }

  return (
    <form action={handleSignOut}>
      <button
        type="submit"
        className="rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700"
      >
        Sign Out
      </button>
    </form>
  );
}

