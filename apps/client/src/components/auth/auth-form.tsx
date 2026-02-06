import { useActionState, useEffect, useRef } from "react";
import { RateLimitError } from "@/lib/auth-client";

export interface FormState {
  error: string | null;
  rateLimitRetry: number | null;
}

const initialState: FormState = {
  error: null,
  rateLimitRetry: null,
};

interface AuthFormProps {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  loadingLabel: string;
  children: React.ReactNode;
}

export function AuthForm({
  action,
  submitLabel,
  loadingLabel,
  children,
}: AuthFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.rateLimitRetry) {
      const timer = setTimeout(() => {
        formRef.current?.requestSubmit();
      }, state.rateLimitRetry * 1000);
      return () => clearTimeout(timer);
    }
  }, [state.rateLimitRetry]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {children}

      {state.error && !state.rateLimitRetry && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md">
          <p className="text-red-400 text-sm">{state.error}</p>
        </div>
      )}

      {state.rateLimitRetry && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-md">
          <p className="text-amber-400 text-sm">
            Too many attempts. Retrying in {state.rateLimitRetry}s...
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || !!state.rateLimitRetry}
        className="w-full py-2.5 px-4 bg-zinc-100 text-zinc-900 font-medium rounded-md 
                   hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors"
      >
        {isPending ? loadingLabel : submitLabel}
      </button>
    </form>
  );
}

interface FormFieldProps {
  id: string;
  name: string;
  type: string;
  label: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  placeholder?: string;
}

export function FormField({
  id,
  name,
  type,
  label,
  required = true,
  minLength,
  autoComplete,
  placeholder,
}: FormFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1.5">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-md 
                   focus:outline-none focus:ring-2 focus:ring-zinc-600 focus:border-transparent
                   placeholder:text-zinc-600 transition-colors"
      />
    </div>
  );
}

export function createFormAction<T>(
  handler: (
    formData: FormData,
  ) => Promise<{ success: true; data: T } | { success: false; error: Error }>,
  onSuccess: (data: T) => void,
) {
  return async (_state: FormState, formData: FormData): Promise<FormState> => {
    const result = await handler(formData);

    if (result.success) {
      onSuccess(result.data);
      return { error: null, rateLimitRetry: null };
    }

    if (result.error instanceof RateLimitError) {
      return { error: null, rateLimitRetry: result.error.retryAfter };
    }

    return { error: result.error.message, rateLimitRetry: null };
  };
}
