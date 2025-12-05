import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth, type Session } from "./auth";

export const getCurrentSession = cache(async (): Promise<Session | null> => {
  return auth.api.getSession({ headers: await headers() });
});

export async function verifySession(redirectTo = "/sign-in"): Promise<Session> {
  const session = await getCurrentSession();
  if (!session) redirect(redirectTo);
  return session;
}

export async function verifyNoSession(redirectTo = "/"): Promise<void> {
  const session = await getCurrentSession();
  if (session) redirect(redirectTo);
}
