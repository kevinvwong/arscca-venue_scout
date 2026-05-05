"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function SetupPage() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]         = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState("");
  const [done, setDone]         = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const res  = await fetch("/api/setup/bootstrap", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, password, name }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Setup failed.");
        return;
      }

      setDone(true);
      // Auto sign-in
      await signIn("credentials", { email, password, callbackUrl: "/admin" });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 max-w-sm w-full text-center">
          <p className="text-lg font-semibold text-gray-900 mb-1">Account created</p>
          <p className="text-sm text-gray-500">Signing you in…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 max-w-sm w-full">
        <h1 className="text-xl font-bold text-gray-900 mb-1">VenueScout Setup</h1>
        <p className="text-sm text-gray-500 mb-6">
          Create the first admin account. This page is only available before any users exist.
        </p>

        {error && (
          <div className="notice notice-error mb-4" role="alert">{error}</div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label className="label" htmlFor="name">Full name</label>
            <input
              id="name"
              type="text"
              className="input w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="input w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="input w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Min 8 characters"
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary w-full flex items-center justify-center gap-2"
            disabled={submitting}
          >
            {submitting && (
              <span className="w-4 h-4 border-2 border-teal-200 border-t-white rounded-full animate-spin" />
            )}
            Create admin account
          </button>
        </form>
      </div>
    </div>
  );
}
