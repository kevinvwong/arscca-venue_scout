import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import SiteHeader from "./components/SiteHeader";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata = {
  title: "VenueScout — Event Venue Discovery",
  description: "Find, score, and secure large outdoor venues for events. Built for TRSS and autocross organizers.",
  openGraph: {
    title: "VenueScout",
    description: "Find large paved lots for driving events. AI scoring, owner lookup, outreach tracking.",
    type: "website",
  },
};

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
