"use server";

import { AUTH_CONFIG } from "@rogue/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export type AuthState = {
  success: boolean;
  message?: string;
  errors?: {
    email?: string[];
    password?: string[];
    name?: string[];
  };
};

export async function signInAction(
  _prevState: AuthState | null,
  formData: FormData,
): Promise<AuthState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const errors: AuthState["errors"] = {};

  if (!email || !email.includes("@")) {
    errors.email = ["Please enter a valid email address"];
  }

  if (!password || password.length < AUTH_CONFIG.PASSWORD.MIN_LENGTH) {
    errors.password = [
      `Password must be at least ${AUTH_CONFIG.PASSWORD.MIN_LENGTH} characters`,
    ];
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, message: "Validation failed", errors };
  }

  try {
    const response = await auth.api.signInEmail({ body: { email, password } });
    if (!response) {
      return { success: false, message: "Invalid credentials" };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Sign in failed",
    };
  }

  redirect(AUTH_CONFIG.ROUTES.DEFAULT_REDIRECT);
}

export async function signUpAction(
  _prevState: AuthState | null,
  formData: FormData,
): Promise<AuthState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const name = formData.get("name") as string;

  const errors: AuthState["errors"] = {};

  if (!email || !email.includes("@")) {
    errors.email = ["Please enter a valid email address"];
  }

  if (!password || password.length < AUTH_CONFIG.PASSWORD.MIN_LENGTH) {
    errors.password = [
      `Password must be at least ${AUTH_CONFIG.PASSWORD.MIN_LENGTH} characters`,
    ];
  }

  if (name && name.length < 2) {
    errors.name = ["Name must be at least 2 characters"];
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, message: "Validation failed", errors };
  }

  try {
    const response = await auth.api.signUpEmail({
      body: { email, password, name: name || email.split("@")[0] },
    });
    if (!response) {
      return { success: false, message: "Sign up failed" };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Sign up failed",
    };
  }

  redirect(AUTH_CONFIG.ROUTES.DEFAULT_REDIRECT);
}

export async function signOutAction(): Promise<void> {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // Session already invalid
  }
  redirect("/");
}
