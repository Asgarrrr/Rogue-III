import { createAuthClient } from "better-auth/react";
import { oneTimeTokenClient } from "better-auth/client/plugins";

const baseURL = import.meta.env.DEV
  ? "http://localhost:3000"
  : window.location.origin;

export const authClient = createAuthClient({
  baseURL,
  plugins: [oneTimeTokenClient()],
  fetchOptions: {
    onError: async (context) => {
      const { response } = context;

      if (response.status === 429) {
        const retryAfter = response.headers.get("X-Retry-After");
        throw new RateLimitError(
          `Too many requests. Retry after ${retryAfter ?? "60"} seconds`,
          Number(retryAfter) || 60,
        );
      }
    },
  },
});

export const { useSession, signIn, signUp, signOut, getSession } = authClient;

export type Session = typeof authClient.$Infer.Session;
export type User = Session["user"];

export interface AuthContext {
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    public retryAfter: number,
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

export class AuthError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export type AuthResult<T> =
  | { success: true; data: T }
  | { success: false; error: AuthError | RateLimitError };

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AuthResult<{ user: User }>> {
  try {
    const { data, error } = await signIn.email({ email, password });

    if (error) {
      return {
        success: false,
        error: new AuthError(error.message ?? "Sign in failed", error.code),
      };
    }

    if (!data?.user) {
      return {
        success: false,
        error: new AuthError("No user returned"),
      };
    }

    return { success: true, data: { user: data.user } };
  } catch (e) {
    if (e instanceof RateLimitError) {
      return { success: false, error: e };
    }
    return {
      success: false,
      error: new AuthError(e instanceof Error ? e.message : "Unknown error"),
    };
  }
}

export async function signUpWithEmail(
  name: string,
  email: string,
  password: string,
): Promise<AuthResult<{ user: User }>> {
  try {
    const { data, error } = await signUp.email({ name, email, password });

    if (error) {
      return {
        success: false,
        error: new AuthError(error.message ?? "Sign up failed", error.code),
      };
    }

    if (!data?.user) {
      return {
        success: false,
        error: new AuthError("No user returned"),
      };
    }

    return { success: true, data: { user: data.user } };
  } catch (e) {
    if (e instanceof RateLimitError) {
      return { success: false, error: e };
    }
    return {
      success: false,
      error: new AuthError(e instanceof Error ? e.message : "Unknown error"),
    };
  }
}
