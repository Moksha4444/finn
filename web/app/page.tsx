"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BriefLine, headlineOf, Name, shortName, Story } from "@/components/Company";
import { Chevron, Collapse } from "@/components/Collapse";
import { eventLabel, FeedRow } from "@/components/FeedRow";
import { Rays } from "@/components/Logo";
import { Count, Signed } from "@/components/Signed";
import { FeedSkeleton, LoadFailed } from "@/components/States";
import { WIN_HOURS, WIN_PERIOD, filedAt, inWindow, istTime, lastDays, ranked, shortDate, useFeed, useSettings, type Feed, type RankedItem, type Settings, type Win } from "@/lib/feed";
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
  if (material.length === 0) return { head: `No material filings ${period}.`, sub: [] }; // the quiet-day block says the rest
  const head = material.length <= 2
    ? `${material.map(name).join(" and ")} ${material.length === 1 ? "needs" : "need"} a look ${period}.`
    : `${material.length} companies need a look ${period}.`;
  return { head, sub: [groups.length > material.length && `${groups.length - material.length} more worth a look`, ...sub].filter(Boolean) as string[] };
}

// SUN 15 NOV, in IST
const edition = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" })
    .format(new Date(iso)).replace(/,/g, "").toUpperCase();

// The entrance plays once per session (masthead, strip, then stories, 40ms apart); later visits render still.
function useEntrance() {
  const [play] = useState(() => typeof window !== "undefined" && !sessionStorage.getItem("finn.entered"));
  useEffect(() => { sessionStorage.setItem("finn.entered", "1"); }, []);
  return play;
}
// Inline links in a sentence: a 44px hit area without changing the line.
const HIT = "relative after:absolute after:-inset-x-1 after:-inset-y-3.5 after:content-['']";
const at = (i: number) => ({ "--i": i }) as React.CSSProperties;

function Masthead({ feed }: { feed: Feed }) {
  const n = feed.portfolio?.length ?? Object.keys(feed.companies ?? {}).length;
  return (
    <header className="pt-4 text-center">
      <Link href="/" aria-label="FINN, Brief" className="wordmark press mx-auto flex w-fit items-center gap-2 rounded-[4px]">
        <Rays className="h-7 w-9" />
        <span className="text-34">FINN</span>
      </Link>
      <p className="mt-3 border-y-[1.5px] border-rule-strong py-1.5 font-mono text-11 leading-4 tracking-[0.02em] whitespace-nowrap text-ink-2">
        {edition(feed.generated_at)} · PORTFOLIO EDITION · {n} HOLDINGS
      </p>
      <p className="mt-2 text-13 text-ink-3">
        Filings ranked, checked {istTime(feed.generated_at)} IST ·{" "}
        <Link href="/settings#how" className={`font-semibold whitespace-nowrap text-accent ${HIT}`}>How it works</Link>
      </p>
    </header>
  );
}

// Every holding's latest day vs Nifty, scrolling sideways. A ticker opens its research page.
function MarketStrip({ feed }: { feed: Feed }) {
  const last = lastDays(feed);
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

// The smallest edition that still holds a filing (a filing older than 30 days is in none).
function winFor(feed: Feed, filed: string): Win | null {
  const hours = (Date.parse(feed.generated_at) - Date.parse(`${filed}:00+05:30`)) / 36e5;
  return WINS.find((w) => hours <= WIN_HOURS[w]) ?? null;
}

// A quiet edition: nothing material, so say so, then what is true anyway. Everything here is from the feed:
// the biggest moves vs Nifty on the latest day, the newest material filing before this window, the hidden count.
function QuietDay({ feed, s, win, routine, open, next, showRoutine }: {
  feed: Feed; s: Settings; win: Win; routine: number; open: (sym: string, w: Win) => void; next: () => void; showRoutine: () => void;
}) {
  const days = [...lastDays(feed).values()].map((d) => ({ ...d, v: d.excess_pct ?? d.move_pct })).filter((d) => d.v != null);
  const up = days.reduce<(typeof days)[number] | null>((a, d) => (d.v > 0 && (!a || d.v > a.v) ? d : a), null);
  const down = days.reduce<(typeof days)[number] | null>((a, d) => (d.v < 0 && (!a || d.v < a.v) ? d : a), null);
  const day = [...days].map((d) => d.date).sort().at(-1);
  const latest = ranked(feed.items, s).filter((i) => !i.collapsed && (i.tier === "P1" || i.boosted)).sort((a, b) => b.filed.localeCompare(a.filed))[0];
  const w = latest ? winFor(feed, latest.filed) : null;
  const name = (sym: string) => feed.companies?.[sym]?.name ?? sym;
  return (
    <div className="card mt-4 px-3">
      {(up || down) && (
        <div className="border-b border-rule py-3">
          <p className="kicker">Portfolio pulse{day && <> · <span className="font-mono tracking-normal">{shortDate(day).toUpperCase()}</span></>} · vs Nifty</p>
          <ul className="mt-1">
            {[up, down].map((d) => d && (
              <li key={d.symbol}>
                <Link href={`/research?symbol=${d.symbol}`} className="press -mx-1 flex min-h-11 items-center gap-2 rounded-[4px] px-1">
                  <span className="w-[5.5rem] shrink-0 font-mono text-13 font-semibold text-ink">{d.symbol}</span>
                  <Name name={name(d.symbol)} className="min-w-0 text-15 text-ink-2" />
                  <span className="ml-auto shrink-0 pl-2 font-mono text-13 font-medium whitespace-nowrap"><Signed text={pct(d.v)} arrows /></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {latest && (
        <div className="border-b border-rule py-3">
          <p className="kicker">Latest material · <span className="font-mono tracking-normal">{shortDate(latest.filed).toUpperCase()}</span></p>
          {w ? (
            <button type="button" onClick={() => open(latest.symbol, w)} className="press -mx-1 mt-1 block min-h-11 w-[calc(100%+0.5rem)] rounded-[4px] px-1 py-1 text-left">
              <span className="kicker flex items-center gap-1.5 text-ink"><span className="shrink-0">{eventLabel(latest)} ·</span><Name name={name(latest.symbol)} className="min-w-0" /></span>
              <span className="mt-0.5 block font-serif text-17 leading-[1.25] font-semibold text-ink"><Signed text={headlineOf(latest)} /></span>
            </button>
          ) : (
            <p className="mt-1 font-serif text-17 leading-[1.25] font-semibold text-ink">{shortName(name(latest.symbol))}: <Signed text={headlineOf(latest)} /></p>
          )}
        </div>
      )}
      {routine > 0 ? (
        <button type="button" onClick={showRoutine}
          className={`press flex min-h-11 w-full items-center justify-between gap-3 text-left text-13 text-ink-2 ${NEXT[win] ? "border-b border-rule" : ""}`}>
          <span><span className="font-mono text-ink">{routine}</span> routine {routine === 1 ? "notice" : "notices"} hidden</span>
          <Chevron open={false} />
        </button>
      ) : (
        <p className={`py-3 text-13 text-ink-2 ${NEXT[win] ? "border-b border-rule" : ""}`}>No routine notices either.</p>
      )}
      {NEXT[win] && (
        <button type="button" onClick={next} className="press -mx-1 flex min-h-12 w-[calc(100%+0.5rem)] items-center rounded-[4px] px-1 text-15 font-semibold text-accent">
          See {WIN_NAME[NEXT[win]!].toLowerCase()}&rsquo;s edition →
        </button>
      )}
    </div>
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
  // exactly one lead per edition: the top-ranked material company, taken out of its own list. A quiet edition
  // has no lead: a dividend set at 24px would contradict "No material filings".
  const quiet = matters.length === 0;
  const top = matters[0];
  const rest = (allCards ? matters : matters.slice(0, CARDS)).filter((g) => g !== top);
  const briefs = worth.filter((g) => g !== top);

  return (
    <div className={enter ? "enter" : undefined}>
      <div style={at(0)}><Masthead feed={feed} /></div>
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
        <h1 className="mt-5 font-serif text-28 leading-[1.05] font-semibold tracking-[-0.01em] text-balance">
          {/* figures in the verdict count up on arrival and whenever an edition or threshold change moves them */}
          {head.split(/(\d+)/).map((t, k) => (k % 2 ? <Count key={k} value={+t} from={enter ? 0 : undefined} /> : t))}
        </h1>
        {sub.length > 0 && <p className="mt-2 text-13 text-ink-2">{sub.join(" · ")}</p>}
        {quiet && (
          <QuietDay feed={feed} s={s} win={win} routine={routine.length} next={() => setWin(NEXT[win]!)}
            showRoutine={() => { setShowRoutine(true); requestAnimationFrame(() => document.getElementById("h-notices")?.scrollIntoView({ block: "start", behavior: "smooth" })); }}
            open={(sym, w) => { setWin(w); setOpenSym(sym); setAllCards(true); }} />
        )}
        {pending && lastBar && (
          <p className="mt-1 text-13 text-ink-3">
            Market reaction to filings after {shortDate(lastBar)} shows after the next price update.
          </p>
        )}
      </section>

      {top && (
        <section aria-label="What matters" style={at(3)} className="mt-5">
          <ol className="space-y-3">
            <Story key={top.symbol} g={top} co={feed.companies?.[top.symbol]} nifty={feed.nifty} end={end} lead initialOpen={top.symbol === openSym} />
            {rest.map((g) => <Story key={g.symbol} g={g} co={feed.companies?.[g.symbol]} nifty={feed.nifty} end={end} initialOpen={g.symbol === openSym} />)}
          </ol>
          {matters.length > CARDS && (
            <button type="button" aria-expanded={allCards} onClick={() => setAllCards(!allCards)}
              className="press mt-1 flex min-h-11 w-full items-center justify-center gap-1 rounded-[4px] text-13 font-semibold text-accent">
              {allCards ? "Show fewer" : `${matters.length - CARDS} more ${matters.length - CARDS === 1 ? "story" : "stories"}`}
              <Chevron open={allCards} />
            </button>
          )}
        </section>
      )}

      {briefs.length > 0 && (
        <section aria-labelledby="h-worth" style={at(4)} className="mt-8">
          <h2 id="h-worth" className="section-head">In brief</h2>
          <ol className="card mt-2 px-3">
            {briefs.map((g) => <BriefLine key={g.symbol} g={g} co={feed.companies?.[g.symbol]} initialOpen={g.symbol === openSym} />)}
          </ol>
        </section>
      )}

      {routine.length > 0 && (
        <section aria-labelledby="h-notices" style={at(5)} className="mt-8 scroll-mt-4">
          <h2 id="h-notices" className="section-head">Notices</h2>
          <div className="card mt-2 px-3">
          <button type="button" aria-expanded={showRoutine} onClick={() => setShowRoutine(!showRoutine)}
            className={`press flex min-h-11 w-full items-center justify-between text-left ${showRoutine ? "border-b border-rule" : ""}`}>
            <span className="kicker text-ink-2"><span className="font-mono tracking-normal">{routine.length}</span> routine {routine.length === 1 ? "notice" : "notices"}</span>
            <span className="kicker flex items-center gap-1 text-accent">{showRoutine ? "Hide" : "Show"} <Chevron open={showRoutine} /></span>
          </button>
          <Collapse open={showRoutine}><ol>{routine.map((i) => <FeedRow key={i.id} item={i} />)}</ol></Collapse>
          </div>
        </section>
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
            <Link href="/settings" className={`font-semibold text-accent ${HIT}`}>Change thresholds</Link>
          </p>
        </details>
      </footer>
    </div>
  );
}
