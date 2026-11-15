"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BriefLine, shortName, Story } from "@/components/Company";
import { Chevron, Collapse } from "@/components/Collapse";
import { FeedRow } from "@/components/FeedRow";
import { Rays } from "@/components/Logo";
import { Signed } from "@/components/Signed";
import { FeedSkeleton, LoadFailed } from "@/components/States";
import { WIN_HOURS, WIN_PERIOD, filedAt, inWindow, istTime, ranked, shortDate, useFeed, useSettings, type Feed, type RankedItem, type Win } from "@/lib/feed";
import { group, type Group } from "@/lib/group";
import { pct } from "@/lib/rank";

const WINS: Win[] = ["24h", "7d", "30d"];
const WIN_NAME: Record<Win, string> = { "24h": "Today", "7d": "This week", "30d": "This month" };
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

// SUN 15 NOV 2026, in IST
const edition = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
    .format(new Date(iso)).replace(/,/g, "").toUpperCase();

// The entrance plays once per session (masthead, strip, then stories, 40ms apart); later visits render still.
function useEntrance() {
  const [play] = useState(() => typeof window !== "undefined" && !sessionStorage.getItem("finn.entered"));
  useEffect(() => { sessionStorage.setItem("finn.entered", "1"); }, []);
  return play;
}
const at = (i: number) => ({ "--i": i }) as React.CSSProperties;

function Masthead({ feed, lastBar }: { feed: Feed; lastBar?: string }) {
  const n = feed.portfolio?.length ?? Object.keys(feed.companies ?? {}).length;
  return (
    <header className="pt-4 text-center">
      <Link href="/" aria-label="FINN, Brief" className="mx-auto flex w-fit items-center gap-2">
        <Rays className="h-7 w-9" />
        <span className="font-serif text-34 leading-none font-bold tracking-[0.12em]">FINN</span>
      </Link>
      <p className="mt-3 border-y-[1.5px] border-rule-strong py-1.5 font-mono text-11 leading-4 tracking-[0.02em] text-ink-2">
        {edition(feed.generated_at)} · PORTFOLIO EDITION · {n} COMPANIES{lastBar && ` · PRICES TO ${shortDate(lastBar).toUpperCase()}`}
      </p>
      <p className="mt-2 text-13 text-ink-3">
        Filings filtered and ranked, checked <span className="font-mono">{istTime(feed.generated_at)}</span> IST ·{" "}
        <Link href="/settings#how" className="font-semibold text-accent">How it works</Link>
      </p>
    </header>
  );
}

// Every holding's latest day vs Nifty, scrolling sideways. A ticker opens its research page.
function MarketStrip({ feed }: { feed: Feed }) {
  const last = new Map<string, Feed["days"][number]>();
  for (const d of feed.days) if (!last.has(d.symbol) || d.date > last.get(d.symbol)!.date) last.set(d.symbol, d);
  const syms = feed.portfolio ?? [...last.keys()];
  const day = [...last.values()].map((d) => d.date).sort().at(-1);
  return (
    <nav aria-label="Portfolio, latest day vs Nifty" className="strip -mx-4 mt-4 overflow-x-auto border-y border-rule">
      <ul className="flex w-max items-stretch pl-4">
        <li className="flex h-11 flex-col justify-center pr-3 font-mono text-11 leading-4 text-ink-3">
          <span>{day ? shortDate(day).toUpperCase() : "DAY"}</span><span>VS NIFTY</span>
        </li>
        {syms.map((s) => {
          const d = last.get(s);
          const v = d ? d.excess_pct ?? d.move_pct : null;
          return (
            <li key={s} className="border-l border-rule last:pr-4">
              <Link href={`/research?symbol=${s}`} className="press flex h-11 flex-col justify-center px-3 font-mono text-11 leading-4">
                <span className="font-semibold text-ink">{s}</span>
                <span className="text-ink-2">{v == null ? "–" : <Signed text={pct(v)} arrows />}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default function Brief() {
  const { feed, error, retry } = useFeed();
  const [s] = useSettings();
  const [win, setWinState] = useState<Win>("24h");
  const [showRoutine, setShowRoutine] = useState(false);
  const [allCards, setAllCards] = useState(false);
  const [openSym, setOpenSym] = useState<string | null>(null);
  const enter = useEntrance();
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
  const lastBar = all.map((i) => i.last_bar).filter(Boolean).sort().at(-1) ?? feed.days.map((d) => d.date).sort().at(-1) ?? undefined;
  const pending = all.some((i) => !i.collapsed && !i.reaction && lastBar && i.reaction_day > lastBar);
  const coverageDays = Math.round((Date.parse(feed.window[1]) - Date.parse(feed.window[0])) / 864e5);
  const short = WIN_HOURS[win] / 24 > coverageDays + 1;
  const end = feed.generated_at.slice(0, 10);
  const missing = feed.failed.filter((f) => !f.as_of).map((f) => f.symbol);
  const staleBy = new Map<string, string[]>(); // as-of time -> symbols kept from that fetch
  for (const [sym, c] of Object.entries(feed.companies ?? {}))
    if (c.stale_as_of) staleBy.set(c.stale_as_of, [...(staleBy.get(c.stale_as_of) ?? []), sym]);
  const stale = [...staleBy];
  const [lead, ...rest] = allCards ? matters : matters.slice(0, CARDS);

  return (
    <div className={enter ? "enter" : undefined}>
      <div style={at(0)}><Masthead feed={feed} lastBar={lastBar} /></div>
      <div style={at(1)}><MarketStrip feed={feed} /></div>

      <section style={at(2)} className="pt-2">
        <div role="group" aria-label="Edition" className="flex gap-6 border-b border-rule">
          {WINS.map((w) => (
            <button key={w} type="button" aria-pressed={w === win} onClick={() => setWin(w)}
              className={`-mb-px h-11 border-b-2 text-11 font-bold tracking-[0.12em] uppercase transition-colors duration-150 ${w === win ? "border-accent text-accent" : "border-transparent text-ink-3"}`}>
              {WIN_NAME[w]}
            </button>
          ))}
        </div>
        <h1 className="mt-6 font-serif text-34 leading-[1.08] font-semibold tracking-[-0.01em] text-balance">{head}</h1>
        {sub.length > 0 && <p className="mt-2 text-13 text-ink-2">{sub.join(" · ")}</p>}
        {pending && lastBar && (
          <p className="mt-1 text-13 text-ink-3">
            Market reaction to filings after {shortDate(lastBar)} shows after the next price update.
          </p>
        )}
      </section>

      {lead && (
        <section aria-label="What matters" style={at(3)} className="mt-6">
          <ol>
            <Story key={lead.symbol} g={lead} co={feed.companies?.[lead.symbol]} nifty={feed.nifty} end={end} lead initialOpen={lead.symbol === openSym} />
            {rest.map((g) => <Story key={g.symbol} g={g} co={feed.companies?.[g.symbol]} nifty={feed.nifty} end={end} initialOpen={g.symbol === openSym} />)}
          </ol>
          {matters.length > CARDS && (
            <button type="button" aria-expanded={allCards} onClick={() => setAllCards(!allCards)}
              className="press flex min-h-11 w-full items-center justify-center gap-1 border-b border-rule text-13 font-semibold text-accent">
              {allCards ? "Show fewer" : `${matters.length - CARDS} more ${matters.length - CARDS === 1 ? "story" : "stories"}`}
              <Chevron open={allCards} />
            </button>
          )}
        </section>
      )}

      {worth.length > 0 && (
        <section aria-labelledby="h-worth" style={at(4)} className="mt-8">
          <h2 id="h-worth" className="section-head">In brief</h2>
          <ol>
            {worth.map((g) => <BriefLine key={g.symbol} g={g} co={feed.companies?.[g.symbol]} initialOpen={g.symbol === openSym} />)}
          </ol>
        </section>
      )}

      {routine.length > 0 && (
        <section aria-labelledby="h-notices" style={at(5)} className="mt-8">
          <h2 id="h-notices" className="section-head">Notices</h2>
          <button type="button" aria-expanded={showRoutine} onClick={() => setShowRoutine(!showRoutine)}
            className="press flex min-h-11 w-full items-center justify-between border-b border-rule text-left">
            <span className="kicker text-ink-2"><span className="font-mono tracking-normal">{routine.length}</span> routine {routine.length === 1 ? "notice" : "notices"}</span>
            <span className="kicker flex items-center gap-1 text-accent">{showRoutine ? "Hide" : "Show"} <Chevron open={showRoutine} /></span>
          </button>
          <Collapse open={showRoutine}><ol>{routine.map((i) => <FeedRow key={i.id} item={i} />)}</ol></Collapse>
        </section>
      )}

      {groups.length === 0 && NEXT[win] && (
        <button type="button" onClick={() => setWin(NEXT[win]!)} className="press mt-4 min-h-11 rounded-[4px] text-15 font-semibold text-accent">
          See {WIN_NAME[NEXT[win]!].toLowerCase()}&rsquo;s edition →
        </button>
      )}

      {missing.length > 0 && (
        <p className="mt-4 text-13 text-ink-2">
          Couldn&rsquo;t fetch filings for <span className="font-mono">{missing.join(", ")}</span>. They are missing from this brief.
        </p>
      )}
      {stale.map(([asOf, syms]) => (
        <p key={asOf} className="mt-4 text-13 text-ink-2">
          Couldn&rsquo;t refresh <span className="font-mono">{syms.join(", ")}</span>. Showing {syms.length === 1 ? "its" : "their"} filings as of {filedAt(asOf)} IST.
        </p>
      ))}

      <footer className="mt-12 border-t-[1.5px] border-rule-strong pt-3 text-13 leading-[1.45] text-ink-2">
        <p className="font-serif text-17 font-semibold text-ink">That&rsquo;s everything{win === "24h" ? " for today" : ""}.</p>
        <details className="mt-1">
          <summary className="min-h-11 cursor-pointer content-center font-semibold text-accent">How ranking works</summary>
          <p className="pb-2">
            {short && `This export covers ${coverageDays} days. `}
            Results, management changes, fund raises, M&amp;A and litigation rank first. A filing rises further when its
            stock moved ±{s.moveX}% vs Nifty or traded {s.volN}× its 20-day volume that day.{" "}
            <Link href="/settings" className="font-semibold text-accent">Change thresholds</Link>
          </p>
        </details>
      </footer>
    </div>
  );
}
