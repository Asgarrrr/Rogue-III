import { Link, useRouter } from "@tanstack/react-router";
import {
  AuthForm,
  FormField,
  createFormAction,
} from "@/components/auth/auth-form";
import { signUpWithEmail, type User } from "@/lib/auth-client";

export function SignUpPage() {
  const router = useRouter();

  const signUpAction = createFormAction<{ user: User }>(
    async (formData) => {
      const name = formData.get("name") as string;
      const email = formData.get("email") as string;
      const password = formData.get("password") as string;
      return signUpWithEmail(name, email, password);
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
          <h1 className="text-2xl font-bold tracking-tight">Sign Up</h1>
          <p className="text-zinc-400 mt-1">Create your Rogue III account</p>
        </header>

        <AuthForm
          action={signUpAction}
          submitLabel="Create Account"
          loadingLabel="Creating account..."
        >
          <FormField
            id="name"
            name="name"
            type="text"
            label="Name"
            autoComplete="name"
            placeholder="Your name"
          />
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
            autoComplete="new-password"
          />
        </AuthForm>

        <p className="text-center text-sm text-zinc-400">
          Already have an account?{" "}
          <Link
            to="/sign-in"
            className="text-zinc-100 hover:underline font-medium"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
