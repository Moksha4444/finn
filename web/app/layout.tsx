import type { Metadata, Viewport } from "next";
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
        <main className="mx-auto max-w-[36rem] px-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">{children}</main>
        <TabBar />
      </body>
    </html>
  );
}
