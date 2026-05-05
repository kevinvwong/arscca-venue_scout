"use client";
import { useEffect } from "react";

export default function AdminError({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Failed to load</h2>
        <p className="text-sm text-gray-500 mb-1">
          {error?.message || "An error occurred loading this page."}
        </p>
        <p className="text-xs text-gray-400 mb-5">
          This may be a temporary issue. Try again or check your connection.
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={reset} className="btn btn-outline text-sm px-4 py-2">
            Retry
          </button>
          <a href="/admin" className="btn btn-primary text-sm px-4 py-2">
            Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
