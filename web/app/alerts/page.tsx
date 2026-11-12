"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Avatar, shortName } from "@/components/Company";
import { eventLabel, keyFact } from "@/components/FeedRow";
import { Signed } from "@/components/Signed";
import { FeedSkeleton, LoadFailed } from "@/components/States";
import { buildAlerts, shortDate, useFeed, useSettings, useUnseen, type Alert } from "@/lib/feed";

const KIND: Record<Alert["kind"], string> = { price: "Price", filing: "Filing", error: "Data" };

export default function Alerts() {
  const { feed, error, retry } = useFeed();
  const [s] = useSettings();
  const alerts = useMemo(() => (feed ? buildAlerts(feed, s) : undefined), [feed, s]);
  const { unseen, markAll, ready } = useUnseen(alerts);
  // Freeze what was new when the inbox opened, then mark everything seen so the badge clears.
  const [fresh, setFresh] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!alerts || !ready || fresh) return;
    setFresh(new Set(unseen.map((a) => a.key)));
    markAll();
  }, [alerts, ready, unseen, fresh, markAll]);

  if (error) return <LoadFailed error={error} retry={retry} />;
  if (!alerts) return <FeedSkeleton header={false} rows={6} />;

  const days = [...new Set(alerts.map((a) => a.date))];
  // the smallest Brief window that still contains the alert's day
  const winFor = (filed: string) => {
    const hours = (Date.parse(feed!.generated_at) - Date.parse(`${filed}:00+05:30`)) / 36e5;
    return hours <= 24 ? "24h" : hours <= 24 * 7 ? "7d" : "30d";
  };
  return (
    <>
      <section className="pt-5 pb-4">
        <h1 className="font-serif text-[1.75rem] leading-[1.15] font-semibold tracking-[-0.015em]">Alerts</h1>
        <p className="mt-1 text-[0.9375rem] text-ink-2">
          Moves of ±{s.moveX}% vs Nifty, volume at {s.volN}× the 20-day average, and material filings in{" "}
          <Link href="/settings" className="text-accent underline">your categories</Link>.
        </p>
      </section>

      {alerts.length === 0 ? (
        <p className="border-t border-ink/80 pt-4 text-[0.9375rem] text-ink-2">
          Nothing crossed your thresholds in this export.
        </p>
      ) : (
        days.map((d) => (
          <section key={d} aria-labelledby={`d-${d}`}>
            <h2 id={`d-${d}`} className="border-b border-rule pt-5 pb-1.5 font-serif text-[1rem] font-semibold">{shortDate(d)}</h2>
            <ul>
              {alerts.filter((a) => a.date === d).map((a) => {
                const kind = a.item ? eventLabel(a.item) : a.kind === "price" ? (a.text.includes("%") ? (a.text.includes("volume") ? "Price & volume" : "Price") : "Volume") : KIND[a.kind];
                const co = feed?.companies?.[a.symbol];
                const body = (
                  <>
                    <Avatar name={co?.name ?? a.item?.name ?? a.symbol} sector={co?.sector} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="text-[0.875rem] font-semibold">{co ? shortName(co.name) : a.symbol}</span>
                        <span className="text-[0.8125rem] text-ink-2">{kind}</span>
                        {fresh?.has(a.key) && <span className="ml-auto text-[0.75rem] font-semibold text-accent">New</span>}
                      </span>
                      <span className={`mt-0.5 block text-[0.875rem] leading-[1.4] [overflow-wrap:anywhere] ${a.kind === "error" ? "text-ink-2" : ""}`}>
                        <Signed text={a.item ? keyFact(a.item) : a.text} />
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={a.key} className="border-b border-rule">
                    {a.item ? (
                      <Link href={`/?open=${a.symbol}&w=${winFor(a.item.filed)}`} className="flex items-center gap-3 py-3 active:bg-paper-2">
                        {body}
                        <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-ink-2" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 py-3">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
