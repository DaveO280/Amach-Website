"use client";

import { useEffect } from "react";

function isRecoverablePrivyWalletError(message: string): boolean {
  return (
    message.includes("createWallet") ||
    (message.includes("onSuccess") && message.includes("undefined"))
  );
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  // Email OTP can succeed while Privy's embedded-wallet create throws.
  // Recover automatically so the user stays signed in instead of hitting a dead error page.
  useEffect(() => {
    if (isRecoverablePrivyWalletError(error.message || "")) {
      console.warn(
        "Recovered from Privy wallet-create error after login:",
        error.message,
      );
      reset();
    }
  }, [error, reset]);

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <h1
        style={{ fontSize: "2rem", fontWeight: "bold", marginBottom: "1rem" }}
      >
        Something went wrong
      </h1>
      <p style={{ fontSize: "1.125rem", marginBottom: "2rem" }}>
        {error.message}
      </p>
      <button
        onClick={reset}
        style={{
          padding: "0.5rem 1rem",
          backgroundColor: "#2563eb",
          color: "white",
          borderRadius: "0.375rem",
          border: "none",
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}
