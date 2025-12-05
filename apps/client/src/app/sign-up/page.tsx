import { Suspense } from "react";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { verifyNoSession } from "@/lib/dal";

/**
 * Sign Up page - SSR with Suspense.
 */
export default function SignUpPage() {
  return (
    <Suspense fallback={<SignUpLoading />}>
      <SignUpContent />
    </Suspense>
  );
}

function SignUpLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
    </div>
  );
}

async function SignUpContent() {
  // Server-side check - redirects if already logged in
  await verifyNoSession();

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-8 px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Sign Up</h1>
          <p className="mt-2 text-sm text-gray-600">
            Create your Rogue III account
          </p>
        </div>

        <SignUpForm />
      </div>
    </div>
  );
}
