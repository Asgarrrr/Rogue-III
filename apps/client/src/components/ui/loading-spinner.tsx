interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  message?: string;
}

const sizes = {
  sm: "w-4 h-4",
  md: "w-6 h-6",
  lg: "w-8 h-8",
};

export function LoadingSpinner({ size = "md", message }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div
        className={`${sizes[size]} border-2 border-zinc-700 border-t-zinc-100 rounded-full animate-spin`}
      />
      {message && <p className="text-zinc-400 text-sm">{message}</p>}
    </div>
  );
}

export function FullPageLoader({
  message = "Loading...",
}: {
  message?: string;
}) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
      <LoadingSpinner size="lg" message={message} />
    </div>
  );
}
