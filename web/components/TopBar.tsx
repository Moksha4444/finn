"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { buildAlerts, useFeed, useSettings, useUnseen } from "@/lib/feed";

const LINKS = [
  { href: "/", text: "Brief" },
  { href: "/alerts", text: "Alerts" },
  { href: "/settings", text: "Settings" },
];

export function TopBar() {
  const path = usePathname();
  const { feed } = useFeed();
  const [s] = useSettings();
  const alerts = useMemo(() => (feed ? buildAlerts(feed, s) : undefined), [feed, s]);
  const { unseen } = useUnseen(alerts);

  return (
    <header className="sticky top-0 z-10 border-b border-rule bg-paper">
      <nav className="mx-auto flex h-12 max-w-[36rem] items-center justify-between px-5" aria-label="Main">
        <Link href="/" className="font-serif text-[1.15rem] font-semibold tracking-[-0.01em]">FINN</Link>
        <ul className="flex items-center gap-5 text-[0.875rem]">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            const count = l.href === "/alerts" && !path.startsWith("/alerts") ? unseen.length : 0;
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-12 items-center gap-1.5 ${active ? "font-semibold text-accent" : "text-ink-2 hover:text-ink"}`}
                >
                  {l.text}
                  {count > 0 && (
                    <span className="min-w-[1.25rem] rounded-full bg-accent px-1.5 text-center text-[0.7rem] leading-[1.25rem] font-semibold text-paper">
                      {count}
                      <span className="sr-only"> new</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
