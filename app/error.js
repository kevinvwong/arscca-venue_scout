"use client";
import { useEffect } from "react";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[calc(100vh-57px)] items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <p className="text-6xl font-bold text-gray-200 mb-4">!</p>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h1>
        <p className="text-sm text-gray-500 mb-6">
          An unexpected error occurred. Try refreshing or going back to the dashboard.
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={reset} className="btn btn-outline px-5 py-2 text-sm">
            Try again
          </button>
          <a href="/admin" className="btn btn-primary px-5 py-2 text-sm">
            Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
