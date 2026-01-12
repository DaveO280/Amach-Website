"use client";

import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary specifically for Privy-related errors
 * Catches and handles errors from Privy's internal components
 */
export class PrivyErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    // Check if this is a Privy-related error we can ignore
    const errorMessage = error.message || "";
    const isPrivyHookError =
      errorMessage.includes("Rendered fewer hooks") ||
      errorMessage.includes("isActive") ||
      errorMessage.includes("DOM element");

    // If it's a Privy internal error, don't show error UI
    // These are known issues with Privy's styled-components
    if (isPrivyHookError) {
      console.warn(
        "⚠️ Caught Privy internal error (known issue, continuing):",
        errorMessage,
      );
      return { hasError: false, error: null };
    }

    // For other errors, show error UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const errorMessage = error.message || "";
    const isPrivyHookError =
      errorMessage.includes("Rendered fewer hooks") ||
      errorMessage.includes("isActive") ||
      errorMessage.includes("DOM element");

    if (!isPrivyHookError) {
      console.error("PrivyErrorBoundary caught an error:", error, errorInfo);
    }
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      return (
        this.props.fallback || (
          <div className="min-h-screen flex items-center justify-center bg-red-50">
            <div className="text-center p-8 bg-white rounded-lg shadow-lg max-w-md">
              <h1 className="text-2xl font-bold text-red-600 mb-4">
                Something went wrong
              </h1>
              <p className="text-gray-700 mb-2">{this.state.error.message}</p>
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
              >
                Try Again
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
