import { Link, useRouter } from "@tanstack/react-router";
import {
  AuthForm,
  FormField,
  createFormAction,
} from "@/components/auth/auth-form";
import { signInWithEmail, type User } from "@/lib/auth-client";

export function SignInPage() {
  const router = useRouter();

  const signInAction = createFormAction<{ user: User }>(
    async (formData) => {
      const email = formData.get("email") as string;
      const password = formData.get("password") as string;
      return signInWithEmail(email, password);
    },
    () => {
      router.invalidate();
      router.navigate({ to: "/game" });
    },
  );

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <header className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Sign In</h1>
          <p className="text-zinc-400 mt-1">Welcome back to Rogue III</p>
        </header>

        <AuthForm
          action={signInAction}
          submitLabel="Sign In"
          loadingLabel="Signing in..."
        >
          <FormField
            id="email"
            name="email"
            type="email"
            label="Email"
            autoComplete="email"
            placeholder="you@example.com"
          />
          <FormField
            id="password"
            name="password"
            type="password"
            label="Password"
            minLength={8}
            autoComplete="current-password"
          />
        </AuthForm>

        <p className="text-center text-sm text-zinc-400">
          Don't have an account?{" "}
          <Link
            to="/sign-up"
            className="text-zinc-100 hover:underline font-medium"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
