"use client";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";

export default function SiteHeader() {
  const { data: session, status } = useSession();

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-admin items-center justify-between px-6 py-3">
        <Link href="/" className="font-bold text-brand-600 text-lg tracking-tight">
          VenueScout
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          {status === "authenticated" ? (
            <>
              <Link href="/admin" className="text-gray-600 hover:text-brand-600 font-medium">
                Dashboard
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="text-gray-400 hover:text-gray-700 text-sm"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/admin" className="text-gray-600 hover:text-brand-600 font-medium">
                Dashboard
              </Link>
              <Link href="/auth/signin" className="btn btn-primary text-sm px-4 py-1.5">
                Sign in
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
