"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { FeedRow } from "@/components/FeedRow";
import { FeedSkeleton, LoadFailed } from "@/components/States";
import { WIN_HOURS, WIN_PERIOD, inWindow, istTime, longDate, ranked, useFeed, useSettings, type Win } from "@/lib/feed";

const WINS: Win[] = ["24h", "7d", "30d"];
const NEXT: Partial<Record<Win, Win>> = { "24h": "7d", "7d": "30d" };

export default function Brief() {
  const { feed, error, retry } = useFeed();
  const [s] = useSettings();
  const [win, setWin] = useState<Win>("24h");
  const [showRoutine, setShowRoutine] = useState(false);

  const all = useMemo(() => (feed ? ranked(inWindow(feed, win), s) : []), [feed, win, s]);
  if (error) return <LoadFailed error={error} retry={retry} />;
  if (!feed) return <FeedSkeleton />;

  const shown = all.filter((i) => !i.collapsed);
  const routine = all.filter((i) => i.collapsed);
  const matter = shown.filter((i) => i.tier === "P1" || i.boosted).length;
  const period = WIN_PERIOD[win];
  const headline =
    matter > 0 ? `${matter} ${matter === 1 ? "thing matters" : "things matter"} ${period}.`
    : shown.length ? `Nothing urgent ${period}.`
    : `Nothing material ${period}.`;
  const sub = [
    matter > 0 && shown.length > matter && `${shown.length - matter} more to note`,
    matter === 0 && shown.length > 0 && `${shown.length} to note`,
    routine.length > 0 && `${routine.length} routine ${routine.length === 1 ? "filing" : "filings"} hidden`,
    all.length === 0 && "No filings in this window",
  ].filter(Boolean).join(" · ");
  const coverageDays = Math.round((Date.parse(feed.window[1]) - Date.parse(feed.window[0])) / 864e5);
  const short = WIN_HOURS[win] / 24 > coverageDays + 1;

  return (
    <>
      <section className="pt-5 pb-4">
        <p className="text-[0.8125rem] text-ink-2">
          {longDate(feed.generated_at)} · Last checked {istTime(feed.generated_at)} IST
        </p>
        <h1 className="mt-1.5 font-serif text-[1.75rem] leading-[1.15] font-semibold tracking-[-0.015em] text-balance">{headline}</h1>
        {sub && <p className="mt-1 text-[0.9375rem] text-ink-2">{sub}</p>}
        <div role="group" aria-label="Window" className="mt-4 inline-flex rounded-md border border-rule p-0.5 text-[0.875rem]">
          {WINS.map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={w === win}
              onClick={() => { setWin(w); setShowRoutine(false); }}
              className={`h-8 min-w-[3.25rem] rounded-[0.3rem] px-3 ${w === win ? "bg-paper-2 font-semibold text-accent" : "text-ink-2 hover:text-ink"}`}
            >
              {w}
            </button>
          ))}
        </div>
      </section>

      <ol className="border-t border-ink/80">
        {shown.map((i) => <FeedRow key={i.id} item={i} />)}
        {routine.length > 0 && (
          <li className="border-b border-rule">
            <button
              type="button"
              aria-expanded={showRoutine}
              onClick={() => setShowRoutine(!showRoutine)}
              className="flex w-full items-baseline justify-between py-3 text-left text-[0.875rem] text-ink-2"
            >
              <span>{routine.length} routine {routine.length === 1 ? "filing" : "filings"}</span>
              <span className="font-medium text-accent">{showRoutine ? "Hide" : "Show"}</span>
            </button>
            {showRoutine && <ol className="border-t border-rule">{routine.map((i) => <FeedRow key={i.id} item={i} />)}</ol>}
          </li>
        )}
      </ol>

      {shown.length === 0 && NEXT[win] && (
        <button type="button" onClick={() => setWin(NEXT[win]!)} className="mt-4 text-[0.875rem] font-medium text-accent underline">
          See the last {NEXT[win] === "7d" ? "7" : "30"} days
        </button>
      )}

      {feed.failed.length > 0 && (
        <p className="mt-4 text-[0.875rem] text-ink-2">
          Couldn&rsquo;t fetch filings for {feed.failed.map((f) => f.symbol).join(", ")}. They are missing from this brief.
        </p>
      )}

      <p className="mt-6 text-[0.8125rem] leading-[1.45] text-ink-2">
        {short && `This export covers ${coverageDays} days. `}
        Ranked by priority, then market reaction: a move of ±{s.moveX}% vs Nifty or {s.volN}× the 20-day volume lifts a filing.{" "}
        <Link href="/settings" className="text-accent underline">Change thresholds</Link>
      </p>
    </>
  );
}
