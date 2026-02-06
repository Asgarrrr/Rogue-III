import { Component, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AuthErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="w-full max-w-sm space-y-6 text-center">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-red-400">
                Something went wrong
              </h1>
              <p className="text-zinc-400 text-sm">
                {this.state.error?.message || "An unexpected error occurred"}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="w-full py-2.5 px-4 bg-zinc-100 text-zinc-900 font-medium rounded-md 
                           hover:bg-zinc-200 transition-colors"
              >
                Try again
              </button>
              <Link
                to="/"
                className="text-zinc-400 hover:text-zinc-100 text-sm transition-colors"
              >
                Go back home
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
