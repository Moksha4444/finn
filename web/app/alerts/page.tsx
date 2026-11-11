"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
            <h2 id={`d-${d}`} className="border-b border-ink/80 pt-4 pb-1.5 text-[0.8125rem] font-semibold">{shortDate(d)}</h2>
            <ul>
              {alerts.filter((a) => a.date === d).map((a) => (
                <li key={a.key} className="border-b border-rule py-2.5">
                  <p className="flex items-baseline gap-2">
                    <span className="text-[0.9375rem] font-semibold tracking-[0.01em]">{a.symbol}</span>
                    <span className="text-[0.875rem] text-ink-2">{a.item ? eventLabel(a.item) : KIND[a.kind]}</span>
                    {fresh?.has(a.key) && <span className="ml-auto text-[0.75rem] font-semibold text-accent">New</span>}
                  </p>
                  <p className={`mt-0.5 text-[0.875rem] leading-[1.4] ${a.kind === "error" ? "text-ink-2" : ""}`}>
                    <Signed text={a.item ? keyFact(a.item) : a.text} />
                    {a.url && (
                      <>
                        {" "}
                        <a href={a.url} target="_blank" rel="noopener" className="whitespace-nowrap text-accent underline">Open filing</a>
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
