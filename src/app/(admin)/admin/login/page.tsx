"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Admin login page.
 *
 * Minimal, password-only sign-in form that POSTs to /api/auth/admin-login.
 * On success the user is redirected to /admin/dashboard. On failure an
 * inline error message is shown.
 *
 * This page is unreachable once an admin session is active — the middleware
 * redirects authenticated admins to /admin/dashboard before this renders.
 */
export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/admin/dashboard");
      } else {
        setError("Incorrect password");
      }
    } catch {
      setError("Incorrect password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-gray-900 p-8 shadow-xl">
        <h1 className="mb-6 text-xl font-bold text-center text-white">
          Admin Login
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in…" : "Enter Admin Panel"}
          </button>
        </form>
      </div>
    </main>
  );
}
