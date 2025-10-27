"use client";

import { useState, useEffect } from "react";

export function ZkSyncAuthorizationAlert(): JSX.Element | null {
  const [showAlert, setShowAlert] = useState(false);

  useEffect(() => {
    // Check if we're on HTTPS localhost
    const isHttpsLocalhost =
      window.location.protocol === "https:" &&
      window.location.hostname === "localhost";

    // Check for authorization error in console (simple heuristic)
    const checkForAuthError = (): void => {
      // This will show the alert on HTTPS localhost as a reminder
      if (isHttpsLocalhost) {
        setShowAlert(true);
      }
    };

    checkForAuthError();
  }, []);

  if (!showAlert) return null;

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-2xl w-full mx-4">
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg shadow-lg">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-yellow-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-yellow-800">
              ZKsync SSO Authorization Required
            </h3>
            <div className="mt-2 text-sm text-yellow-700">
              <p className="mb-2">
                To use ZKsync SSO features, you need to authorize this domain:
              </p>
              <ol className="list-decimal list-inside space-y-1 mb-3">
                <li>
                  Visit{" "}
                  <a
                    href="https://portal.zksync.io/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-medium"
                  >
                    portal.zksync.io
                  </a>
                </li>
                <li>Connect your wallet</li>
                <li>
                  Navigate to &ldquo;SSO&rdquo; or &ldquo;Applications&rdquo;
                </li>
                <li>
                  Add domain:{" "}
                  <code className="bg-yellow-100 px-1 rounded">
                    https://localhost:3000
                  </code>
                </li>
                <li>Save and refresh this page</li>
              </ol>
              <p className="text-xs">
                Check the browser console (F12) for detailed error messages.
              </p>
            </div>
          </div>
          <div className="ml-3 flex-shrink-0">
            <button
              onClick={() => setShowAlert(false)}
              className="inline-flex text-yellow-400 hover:text-yellow-600 focus:outline-none"
            >
              <span className="sr-only">Dismiss</span>
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
