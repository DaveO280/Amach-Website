"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Alert, AlertDescription } from "./ui/alert";
import { Loader2, Shield, AlertCircle } from "lucide-react";

interface AdminAuthProps {
  onAuthSuccess: () => void;
}

export const AdminAuth: React.FC<AdminAuthProps> = ({ onAuthSuccess }) => {
  const [adminKey, setAdminKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();

    if (!adminKey) {
      setError("Please enter the admin key");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Simple admin key validation (in production, use proper authentication)
      const validAdminKeys = [
        "amach-admin-2024",
        "admin-key-secure",
        process.env.NEXT_PUBLIC_ADMIN_KEY || "dev-admin-key",
      ];

      if (validAdminKeys.includes(adminKey)) {
        // Store admin token
        localStorage.setItem("admin_token", "authenticated");
        localStorage.setItem("admin_auth_time", Date.now().toString());

        onAuthSuccess();
      } else {
        setError("Invalid admin key");
      }
    } catch (error) {
      setError("Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-white to-emerald-50 p-6">
      <Card className="w-full max-w-md admin-card">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-emerald-100 to-emerald-200 rounded-full flex items-center justify-center mb-4 shadow-lg">
            <Shield className="h-8 w-8 text-emerald-600" />
          </div>
          <div className="flex items-center justify-center mb-2">
            <CardTitle className="admin-text-primary text-2xl font-black">
              Amach Health
            </CardTitle>
            <span className="text-xs font-semibold text-emerald-600 ml-2 px-2 py-1 bg-emerald-100 rounded-full">
              ADMIN
            </span>
          </div>
          <p className="admin-text-secondary">
            Enter your admin key to access the dashboard
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <Label
                htmlFor="adminKey"
                className="admin-text-primary font-medium"
              >
                Admin Key
              </Label>
              <Input
                id="adminKey"
                type="password"
                placeholder="Enter admin key"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                required
                className="admin-input mt-1"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
              size="lg"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                "Access Dashboard"
              )}
            </Button>
          </form>

          {error && (
            <Alert
              variant="destructive"
              className="mt-4 border-red-200 bg-red-50"
            >
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-700">
                {error}
              </AlertDescription>
            </Alert>
          )}

          <div className="mt-6 p-4 bg-emerald-50 rounded-lg border border-emerald-100">
            <p className="text-xs admin-text-secondary">
              <strong className="text-emerald-700">Development Mode:</strong>{" "}
              Use &quot;dev-admin-key&quot; or &quot;amach-admin-2024&quot; for
              testing.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
