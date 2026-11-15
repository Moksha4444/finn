import type { Metadata, Viewport } from "next";
import { ViewTransition } from "react";
import { IBM_Plex_Mono, Lora, Newsreader, Source_Sans_3 } from "next/font/google";
import { Splash } from "@/components/Logo";
import { TabBar, TopBar } from "@/components/TabBar";
import "./globals.css";

// Newsreader: a newspaper serif for headlines and the wordmark. Source Sans 3: body and UI.
// IBM Plex Mono: every figure and ticker, so numbers align on their decimals.
const serif = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], weight: ["500", "600", "700"] });
// Lora: the wordmark only. Warmer than Newsreader, with soft, brushed terminals.
const wordmark = Lora({ variable: "--font-lora", subsets: ["latin"], weight: ["600", "700"] });
const sans = Source_Sans_3({ variable: "--font-source-sans", subsets: ["latin"], weight: ["400", "600", "700"] });
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "FINN · Portfolio brief",
  description: "What changed in your portfolio, ranked by what matters.",
  appleWebApp: { capable: true, title: "FINN", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

// "only light": Android Chrome's auto-dark otherwise repaints the paper design (seen on the user's phone, 12 Nov).
export const viewport: Viewport = {
  themeColor: "#F5F1E8", colorScheme: "only light", width: "device-width", initialScale: 1, viewportFit: "cover",
};

// Runs before first paint: the splash shows on launch only, not if FINN was opened in the last 5 minutes.
const SPLASH_GATE = `try{var n=Date.now(),t=+localStorage.getItem("finn.opened")||0;if(n-t<3e5)document.documentElement.dataset.splash="skip";localStorage.setItem("finn.opened",n)}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${serif.variable} ${wordmark.variable} ${sans.variable} ${mono.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SPLASH_GATE }} />
      </head>
      <body className="min-h-dvh">
        <Splash />
        <TopBar />
        {/* route changes are transitions, so this crossfades tabs (120ms, see globals.css) */}
        <ViewTransition>
          <main className="mx-auto max-w-[36rem] px-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">{children}</main>
        </ViewTransition>
        <TabBar />
        {/* laptops only (a wide screen with a mouse): the column stays phone-sized, this says why */}
        <aside className="fixed top-20 left-[calc(50%+18rem+2.5rem)] hidden w-44 text-13 leading-snug text-ink-2 lg:block [@media(pointer:coarse)]:hidden">
          <p className="font-serif text-17 font-semibold text-ink">FINN is built for your phone.</p>
          <p className="mt-1">Scan to open it there, or add it to your home screen.</p>
          <img src="/qr.svg" alt="QR code for finn-coral-eta.vercel.app" width={132} height={132} className="mt-3 size-[8.25rem] rounded-[4px] border border-rule bg-paper-raised p-2" />
        </aside>
      </body>
    </html>
  );
}
