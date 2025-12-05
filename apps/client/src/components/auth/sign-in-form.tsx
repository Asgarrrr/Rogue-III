"use client";

import Link from "next/link";
import { useActionState } from "react";
import { type AuthState, signInAction } from "@/app/actions/auth";

export function SignInForm() {
  const [state, formAction, isPending] = useActionState<
    AuthState | null,
    FormData
  >(signInAction, null);

  return (
    <form action={formAction} className="mt-8 space-y-6">
      <div className="space-y-4">
        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
            disabled={isPending}
          />
          {state?.errors?.email && (
            <p className="mt-1 text-sm text-red-600">{state.errors.email[0]}</p>
          )}
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
            disabled={isPending}
          />
          {state?.errors?.password && (
            <p className="mt-1 text-sm text-red-600">
              {state.errors.password[0]}
            </p>
          )}
        </div>
      </div>

      {/* General error */}
      {state?.message && !state.success && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-800">{state.message}</p>
        </div>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
      >
        {isPending ? "Signing in..." : "Sign In"}
      </button>

      {/* Sign up link */}
      <p className="text-center text-sm">
        Don't have an account?{" "}
        <Link href="/sign-up" className="text-indigo-600 hover:text-indigo-500">
          Sign up
        </Link>
      </p>
    </form>
  );
}
