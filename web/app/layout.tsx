import type { Metadata, Viewport } from "next";
import { ViewTransition } from "react";
import { Libre_Franklin, Source_Serif_4 } from "next/font/google";
import { TabBar, TopBar } from "@/components/TabBar";
import "./globals.css";

// Franklin Gothic is the newspaper workhorse sans; tabular figures keep number columns aligned.
const franklin = Libre_Franklin({ variable: "--font-franklin", subsets: ["latin"] });
const serif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FINN · Portfolio brief",
  description: "What changed in your portfolio, ranked by what matters.",
  appleWebApp: { capable: true, title: "FINN", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

// "only light": Android Chrome's auto-dark otherwise repaints the paper design (seen on the user's phone, 12 Nov).
export const viewport: Viewport = {
  themeColor: "#f8f5ef", colorScheme: "only light", width: "device-width", initialScale: 1, viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${franklin.variable} ${serif.variable} antialiased`}>
      <body className="min-h-dvh">
        <TopBar />
        {/* route changes are transitions, so this crossfades tabs (180ms, see globals.css) */}
        <ViewTransition>
          <main className="mx-auto max-w-[36rem] px-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">{children}</main>
        </ViewTransition>
        <TabBar />
        {/* laptops only (a wide screen with a mouse): the column stays phone-sized, this says why */}
        <aside className="fixed top-20 left-[calc(50%+18rem+2.5rem)] hidden w-44 text-[0.8125rem] leading-snug text-ink-2 lg:block [@media(pointer:coarse)]:hidden">
          <p className="font-serif text-[1rem] font-semibold text-ink">FINN is built for your phone.</p>
          <p className="mt-1">Scan to open it there, or add it to your home screen.</p>
          <img src="/qr.svg" alt="QR code for finn-coral-eta.vercel.app" width={132} height={132} className="mt-3 size-[8.25rem] rounded-md border border-rule bg-card p-2" />
        </aside>
      </body>
    </html>
  );
}
