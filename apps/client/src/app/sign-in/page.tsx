import { Suspense } from "react";
import { SignInForm } from "@/components/auth/sign-in-form";
import { verifyNoSession } from "@/lib/dal";

/**
 * Sign In page - SSR with Suspense.
 */
export default function SignInPage() {
  return (
    <Suspense fallback={<SignInLoading />}>
      <SignInContent />
    </Suspense>
  );
}

function SignInLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
    </div>
  );
}

async function SignInContent() {
  // Server-side check - redirects if already logged in
  await verifyNoSession();

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-8 px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Sign In</h1>
          <p className="mt-2 text-sm text-gray-600">
            Welcome back to Rogue III
          </p>
        </div>

        <SignInForm />
      </div>
    </div>
  );
}
