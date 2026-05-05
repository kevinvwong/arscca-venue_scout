"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";

const TABS = [
  { label: "Venues",   href: "/admin" },
  { label: "Pipeline", href: "/admin/pipeline" },
  { label: "Library",  href: "/admin/library" },
  { label: "Outreach", href: "/admin/outreach" },
  { label: "Search",   href: "/admin/search" },
  { label: "Settings", href: "/admin/settings" },
];

export default function AdminLayout({ children }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Admin top bar */}
      <div className="bg-gray-900 text-white">
        <div className="mx-auto max-w-admin px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-400 hover:text-white text-sm">← Site</Link>
            <span className="text-gray-600">|</span>
            <span className="font-semibold text-sm text-brand-400 tracking-wide uppercase">Admin</span>
          </div>
          <Link href="/api/auth/signout" className="text-sm text-gray-400 hover:text-white">
            Sign out
          </Link>
        </div>
      </div>

      {/* Tab nav */}
      <div className="bg-white border-b border-gray-200">
        <div className="mx-auto max-w-admin px-6">
          <nav className="flex gap-1" aria-label="Admin navigation">
            {TABS.map(({ label, href }) => {
              const active = pathname === href || (href !== "/admin" && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    active
                      ? "border-brand-500 text-brand-700"
                      : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {pathname === "/admin/search" ? children : (
        <div className="mx-auto max-w-admin px-6 py-8">
          {children}
        </div>
      )}
    </div>
  );
}
