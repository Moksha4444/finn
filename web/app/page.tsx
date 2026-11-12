"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CompanyCard, CompanyRow, shortName } from "@/components/Company";
import { Collapse } from "@/components/Collapse";
import { FeedRow } from "@/components/FeedRow";
import { FeedSkeleton, LoadFailed } from "@/components/States";
import { WIN_HOURS, WIN_PERIOD, inWindow, istTime, longDate, ranked, shortDate, useFeed, useSettings, type Feed, type RankedItem, type Win } from "@/lib/feed";
import { group, type Group } from "@/lib/group";

const WINS: Win[] = ["24h", "7d", "30d"];
const NEXT: Partial<Record<Win, Win>> = { "24h": "7d", "7d": "30d" };
const CARDS = 6; // a 30-day results season makes every holding material; the rest wait behind one tap

// The day's verdict. In results season it is about results; otherwise it names who needs a look.
function verdict(feed: Feed, all: RankedItem[], groups: Group[], win: Win, moveX: number): { head: string; sub: string[] } {
  const material = groups.filter((g) => g.material);
  const period = WIN_PERIOD[win];
  const portfolio = feed.portfolio?.length ?? new Set(feed.items.map((i) => i.symbol)).size;
  const results = all.filter((i) => i.category === "results" && i.tier !== "P3");
  const reported = new Set(results.map((i) => i.symbol));
  const moved = new Set(results.filter((i) => i.reaction && Math.abs(i.reaction.excess_pct ?? i.reaction.move_pct) >= moveX).map((i) => i.symbol));
  const routine = all.filter((i) => i.collapsed).length;
  const sub = [routine > 0 && `${routine} routine ${routine === 1 ? "filing" : "filings"} hidden`].filter(Boolean) as string[];

  if (win !== "24h" && reported.size >= portfolio / 2)
    return { head: `Results season: ${reported.size} of ${portfolio} reported.`, sub: [`${moved.size} moved ±${moveX}% vs Nifty on results`, ...sub] };
  const name = (g: Group) => { const n = shortName(feed.companies?.[g.symbol]?.name ?? g.lead.name); return n.length > 24 ? g.symbol : n; };
  if (material.length === 0)
    return { head: groups.length ? `Nothing urgent ${period}.` : `Nothing material ${period}.`, sub: [groups.length > 0 && `${groups.length} worth a look`, ...sub].filter(Boolean) as string[] };
  const head = material.length <= 2
    ? `${material.map(name).join(" and ")} ${material.length === 1 ? "needs" : "need"} a look ${period}.`
    : `${material.length} companies need a look ${period}.`;
  return { head, sub: [groups.length > material.length && `${groups.length - material.length} more worth a look`, ...sub].filter(Boolean) as string[] };
}

export default function Brief() {
  const { feed, error, retry } = useFeed();
  const [s] = useSettings();
  const [win, setWinState] = useState<Win>("24h");
  const [showRoutine, setShowRoutine] = useState(false);
  const [allCards, setAllCards] = useState(false);
  const [openSym, setOpenSym] = useState<string | null>(null);
  useEffect(() => {
    // an alert links here as /?open=SYMBOL&w=7d; otherwise keep the window chosen earlier in this session
    const q = new URLSearchParams(location.search);
    const w = (q.get("w") ?? sessionStorage.getItem("finn.win")) as Win | null;
    if (w && WINS.includes(w)) setWinState(w);
    if (q.get("open")) {
      setOpenSym(q.get("open"));
      setAllCards(true);
      history.replaceState(null, "", "/"); // a reload shouldn't re-open it
    }
  }, []);
  const setWin = (w: Win) => { setWinState(w); setShowRoutine(false); setAllCards(false); sessionStorage.setItem("finn.win", w); };

  const all = useMemo(() => (feed ? ranked(inWindow(feed, win), s) : []), [feed, win, s]);
  const groups = useMemo(() => group(all), [all]);
  if (error) return <LoadFailed error={error} retry={retry} />;
  if (!feed) return <FeedSkeleton />;

  const { head, sub } = verdict(feed, all, groups, win, s.moveX);
  const matters = groups.filter((g) => g.material);
  const worth = groups.filter((g) => !g.material);
  const routine = all.filter((i) => i.collapsed);
  const lastBar = all.map((i) => i.last_bar).filter(Boolean).sort().at(-1);
  const pending = all.some((i) => !i.collapsed && !i.reaction && lastBar && i.reaction_day > lastBar);
  const coverageDays = Math.round((Date.parse(feed.window[1]) - Date.parse(feed.window[0])) / 864e5);
  const short = WIN_HOURS[win] / 24 > coverageDays + 1;
  const end = feed.generated_at.slice(0, 10);

  return (
    <>
      <section className="pt-5">
        <p className="text-[0.8125rem] text-ink-2">
          {longDate(feed.generated_at)} · Last checked {istTime(feed.generated_at)} IST
        </p>
        <h1 className="mt-1.5 font-serif text-[1.75rem] leading-[1.15] font-semibold tracking-[-0.015em] text-balance">{head}</h1>
        {sub.length > 0 && <p className="mt-1 text-[0.9375rem] text-ink-2">{sub.join(" · ")}</p>}
        <div role="group" aria-label="Window" className="mt-4 grid grid-cols-3 rounded-lg border border-rule bg-paper-2/60 p-0.5 text-[0.9375rem]">
          {WINS.map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={w === win}
              onClick={() => setWin(w)}
              className={`h-11 rounded-md ${w === win ? "bg-card font-semibold text-accent shadow-[0_1px_2px_oklch(22%_0.012_60/0.12)]" : "text-ink-2"}`}
            >
              {w === "24h" ? "Today" : w === "7d" ? "7 days" : "30 days"}
            </button>
          ))}
        </div>
        {pending && lastBar && (
          <p className="mt-3 rounded-lg bg-paper-2 px-3 py-2 text-[0.8125rem] leading-[1.4] text-ink-2">
            Prices are in up to {shortDate(lastBar)}. Market reaction to later filings shows after the next price update.
          </p>
        )}
      </section>

      {matters.length > 0 && (
        <section aria-labelledby="h-matters" className="mt-6">
          <h2 id="h-matters" className="font-serif text-[1.1875rem] font-semibold">What matters</h2>
          <ol className="mt-2.5 space-y-3">
            {(allCards ? matters : matters.slice(0, CARDS)).map((g) => <CompanyCard key={g.symbol} g={g} co={feed.companies?.[g.symbol]} nifty={feed.nifty} end={end} initialOpen={g.symbol === openSym} />)}
          </ol>
          {matters.length > CARDS && (
            <button type="button" aria-expanded={allCards} onClick={() => setAllCards(!allCards)} className="mt-2 min-h-11 w-full rounded-xl border border-rule text-[0.875rem] font-medium text-accent">
              {allCards ? "Show fewer" : `Show ${matters.length - CARDS} more ${matters.length - CARDS === 1 ? "company" : "companies"}`}
            </button>
          )}
        </section>
      )}

      {worth.length > 0 && (
        <section aria-labelledby="h-worth" className="mt-7">
          <h2 id="h-worth" className="font-serif text-[1.1875rem] font-semibold">Also worth a look</h2>
          <ol className="mt-1 border-t border-rule">
            {worth.map((g) => <CompanyRow key={g.symbol} g={g} co={feed.companies?.[g.symbol]} initialOpen={g.symbol === openSym} />)}
          </ol>
        </section>
      )}

      {routine.length > 0 && (
        <section className={matters.length + worth.length ? "mt-6" : "mt-5"}>
          <button
            type="button"
            aria-expanded={showRoutine}
            onClick={() => setShowRoutine(!showRoutine)}
            className="flex min-h-11 w-full items-center justify-between border-y border-rule text-left text-[0.875rem] text-ink-2"
          >
            <span>{routine.length} routine {routine.length === 1 ? "filing" : "filings"} hidden</span>
            <span className="font-medium text-accent">{showRoutine ? "Hide" : "Show"}</span>
          </button>
          <Collapse open={showRoutine}><ol>{routine.map((i) => <FeedRow key={i.id} item={i} />)}</ol></Collapse>
        </section>
      )}

      {groups.length === 0 && NEXT[win] && (
        <button type="button" onClick={() => setWin(NEXT[win]!)} className="mt-4 min-h-11 text-[0.9375rem] font-medium text-accent underline">
          See the last {NEXT[win] === "7d" ? "7" : "30"} days
        </button>
      )}

      {feed.failed.length > 0 && (
        <p className="mt-4 text-[0.875rem] text-ink-2">
          Couldn&rsquo;t fetch filings for {feed.failed.map((f) => f.symbol).join(", ")}. They are missing from this brief.
        </p>
      )}

      <footer className="mt-8 text-[0.8125rem] leading-[1.45] text-ink-2">
        <p className="font-serif text-[1rem] text-ink">That&rsquo;s everything{win === "24h" ? " for today" : ""}.</p>
        <details className="mt-2">
          <summary className="min-h-11 cursor-pointer content-center font-medium text-accent">How ranking works</summary>
          <p className="pb-2">
            {short && `This export covers ${coverageDays} days. `}
            Results, management changes, fund raises, M&amp;A and litigation rank first. A filing rises further when its
            stock moved ±{s.moveX}% vs Nifty or traded {s.volN}× its 20-day volume that day.{" "}
            <Link href="/settings" className="text-accent underline">Change thresholds</Link>
          </p>
        </details>
      </footer>
    </>
  );
}
