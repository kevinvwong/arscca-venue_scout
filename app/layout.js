import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata = {
  title: "VenueScout — Event Venue Discovery",
  description: "Find, score, and secure large outdoor venues for your events.",
};

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-admin items-center justify-between px-6 py-3">
        <a href="/" className="flex items-center gap-2 font-bold text-brand-600 text-lg tracking-tight">
          VenueScout
        </a>
        <nav className="flex items-center gap-6 text-sm">
          <a href="/admin" className="text-gray-600 hover:text-brand-600 font-medium">Dashboard</a>
          <a href="/auth/signin" className="text-gray-500 hover:text-brand-600">Sign in</a>
        </nav>
      </div>
    </header>
  );
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-gray-50 text-ink antialiased">
        <Providers>
          <SiteHeader />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
