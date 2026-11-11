import type { Metadata, Viewport } from "next";
import { Libre_Franklin, Source_Serif_4 } from "next/font/google";
import { TopBar } from "@/components/TopBar";
import "./globals.css";

// Franklin Gothic is the newspaper workhorse sans; tabular figures keep number columns aligned.
const franklin = Libre_Franklin({ variable: "--font-franklin", subsets: ["latin"] });
const serif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FINN · Portfolio brief",
  description: "What changed in your portfolio, ranked by what matters.",
};

export const viewport: Viewport = { themeColor: "#f8f5ef", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${franklin.variable} ${serif.variable} antialiased`}>
      <body className="min-h-dvh">
        <TopBar />
        <main className="mx-auto max-w-[36rem] px-5 pb-16">{children}</main>
      </body>
    </html>
  );
}
