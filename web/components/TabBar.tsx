"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { alertRows, needsLook } from "@/lib/alerts";
import { buildAlerts, useFeed, useSettings, useUnseen } from "@/lib/feed";
import { Wordmark } from "./Logo";

// One stroke family (1.75, round caps) on a 24px grid, drawn for this app.
const ICONS: Record<string, React.ReactNode> = {
  "/": <path d="M5 6.5h14M5 12h10M5 17.5h5" />,
  "/alerts": <><path d="M6.5 16.5v-5a5.5 5.5 0 0 1 11 0v5l1.5 1.5h-14z" /><path d="M10 20.5h4" /></>,
  "/research": <><circle cx="10.5" cy="10.5" r="5.5" /><path d="M14.5 14.5l5 5" /></>,
  "/settings": <><path d="M5 7.5h8M17 7.5h2M5 16.5h2M11 16.5h8" /><circle cx="15" cy="7.5" r="2" /><circle cx="9" cy="16.5" r="2" /></>,
};
const TABS = [
  { href: "/", text: "Brief" },
  { href: "/alerts", text: "Alerts" },
  { href: "/research", text: "Research" },
  { href: "/settings", text: "Settings" },
];

export function TopBar() {
  return (
    <header className="border-b border-rule bg-paper pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-12 max-w-[36rem] items-center px-5">
        <Link href="/" aria-label="FINN, Brief" className="-mx-2 flex h-11 items-center px-2"><Wordmark /></Link>
      </div>
    </header>
  );
}

export function TabBar() {
  const path = usePathname();
  const { feed } = useFeed();
  const [s] = useSettings();
  const alerts = useMemo(() => (feed ? buildAlerts(feed, s) : undefined), [feed, s]);
  const { unseen } = useUnseen(alerts);
  // one per inbox row that needs a look, as the inbox headline counts them
  const fresh = useMemo(() => {
    const keys = new Set(unseen.map((a) => a.key));
    return alerts ? alertRows(alerts).filter((r) => needsLook(r) && r.keys.some((k) => keys.has(k))).length : 0;
  }, [alerts, unseen]);

  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-paper pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid h-14 max-w-[36rem] grid-cols-4">
        {TABS.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          const count = t.href === "/alerts" && !active ? fresh : 0;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-0.5 text-[0.6875rem] ${active ? "font-semibold text-accent" : "text-ink-2"}`}
              >
                <span className="relative">
                  <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {ICONS[t.href]}
                  </svg>
                  {count > 0 && (
                    <span key={count} className="absolute -top-1 left-4 min-w-[1.125rem] animate-pop rounded-full bg-accent px-1 text-center text-[0.6875rem] leading-[1.125rem] font-semibold text-paper ring-2 ring-paper">
                      {count}
                      <span className="sr-only"> new</span>
                    </span>
                  )}
                </span>
                {t.text}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
