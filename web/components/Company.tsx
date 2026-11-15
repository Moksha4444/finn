"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { filedAt, shortDate, type Company as Co, type RankedItem } from "@/lib/feed";
import { grade } from "@/lib/grade";
import type { Group } from "@/lib/group";
import { period } from "@/lib/period";
import { pct } from "@/lib/rank";
import { Sparkline } from "./charts/Charts";
import { Chevron, Collapse } from "./Collapse";
import { crore, Detail, eventLabel, FeedRow, keyFact, reasonText, title } from "./FeedRow";
import { Signed } from "./Signed";

// ---- identity: a company is its ticker in mono plus its name; no tiles ----
export const shortName = (name: string) =>
  name.replace(/\s*\((India|I)\)\s*/i, " ").replace(/\s+(Company\s+)?(Ltd\.?|Limited)$/i, "").replace(/^The\s+/i, "").trim();

// Sector tint: a muted hue derived from screener's sector name (never per ticker), used only as the lead story's edge.
const HUES = [28, 62, 96, 150, 188, 226, 262, 318];
function tint(sector: string | null | undefined) {
  if (!sector) return "var(--rule)";
  let h = 0;
  for (const c of sector) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `oklch(var(--tint-l) var(--tint-c) ${HUES[h % HUES.length]})`;
}

// ---- headline + key numbers ----
function headlineOf(i: RankedItem): string {
  const c = i.card;
  if (c?.type === "results") {
    const pat = c.lines[c.lines.length - 1];
    const q = `the ${period(c.periods[0])} quarter`;
    if (pat?.yoy_pct != null) return `Profit ${pat.yoy_pct >= 0 ? "up" : "down"} ${Math.abs(pat.yoy_pct).toFixed(1)}% YoY in ${q}`;
    return `Results for ${q}`;
  }
  return i.title ? title(i) : keyFact(i); // no human title: the person line ("X appointed, Independent Director"), not the raw subject
}

// The lead's deck (why it matters), only from the filing: a results one-off, else the ingest note. None is fine.
function deckOf(i: RankedItem): string | null {
  if (i.card?.type === "results") return i.card.one_offs[0] ?? null;
  return i.note ?? null;
}

const SHORT: Record<string, string> = { Revenue: "Rev", "Total income": "Income", "PAT (to owners)": "PAT" };

// Two figures only, mono: label / value / change; the full table is one tap away.
function Numbers({ i }: { i: RankedItem }) {
  const c = i.card;
  let rows: [string, string, React.ReactNode][] = [];
  let head = "";
  if (c?.type === "results") {
    head = "YoY";
    rows = [c.lines[0], c.lines[c.lines.length - 1]].map((l) => [
      SHORT[l.name] ?? l.name, l.value == null ? "not disclosed" : `₹${crore(l.value)} cr`,
      l.yoy_pct == null ? <span className="text-ink-3">–</span> : <Signed text={pct(l.yoy_pct)} />,
    ]);
  } else if (c?.type === "fund_raise") {
    if (c.size_cr != null) rows.push(["Size", `₹${crore(c.size_cr)} cr`, ""]);
    if (c.dilution_pct != null) rows.push(["Dilution", `${c.dilution_pct.toFixed(1)}%`, ""]);
  }
  if (!rows.length) return <span />;
  return (
    <table className="min-w-0 border-collapse font-mono text-13 leading-5">
      {head && (
        <thead>
          <tr className="text-11 leading-4 text-ink-3">
            <th scope="col"><span className="sr-only">Line</span></th>
            <th scope="col"><span className="sr-only">This quarter</span></th>
            <th scope="col" className="text-right font-normal">{head}</th>
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map(([k, v, d]) => (
          <tr key={k}>
            <th scope="row" className="pr-3 text-left font-sans text-13 font-normal text-ink-3">{k}</th>
            <td className="pr-3 text-right font-semibold whitespace-nowrap">{v}</td>
            <td className="text-right whitespace-nowrap">{d}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// The market's verdict for the company: the filing that moved it, else the lead's reaction. Nothing while pending.
function reactionOf(g: Group): { text: string; strong: boolean; day?: string } | null {
  const it = [g.lead, ...g.docs, ...g.more].find((i) => i.boosted) ?? g.lead;
  const r = reasonText(it);
  if (!r || r === "Reaction pending" || r === "No price data") return null;
  const x = it.reaction;
  // a volume-only crossing still says which way the stock went
  const text = it.boosted && !r.includes("%") && x ? `${pct(x.excess_pct ?? x.move_pct)}${x.excess_pct != null ? " vs Nifty" : ""} · ${r}` : r;
  return { text, strong: it.boosted, day: x ? shortDate(it.reaction_day) : undefined };
}

// Signals are typeset text, not chips: "12 NOV · ▲ 3.2% vs Nifty · 3.7× vol", coloured on the number only.
function Reaction({ g }: { g: Group }) {
  const c = reactionOf(g);
  if (!c) return null;
  return (
    <p className={`font-mono text-13 leading-5 ${c.strong ? "font-medium text-ink" : "text-ink-2"}`}>
      {c.strong && <span className="sr-only">Ranked high: </span>}
      {c.day && <span className="text-ink-3">{c.day.toUpperCase()} · </span>}
      <Signed text={c.text} arrows />
    </p>
  );
}

// Report-card stamp: management's record on its own concall promises, measured only; links to Research.
function Stamp({ sym, co }: { sym: string; co?: Co }) {
  const c = co?.credibility;
  if (!c) return null;
  const g = grade(c);
  const parts = [`Kept ${c.kept}`, `Missed ${c.missed}`, c.open > 0 && `Open ${c.open}`].filter(Boolean).join(" · ");
  return (
    <Link href={`/research?symbol=${sym}#pvd`} aria-label={`Management promises, last 4 calls: ${parts}${g ? `, grade ${g}` : ""}. Open research`}
      className="press relative z-10 -my-2 inline-flex min-h-11 items-center gap-2 rounded-[4px] py-2 pr-1">
      <GradeMark g={g} />
      <span className="font-mono text-11 leading-4 text-ink-2">PROMISES<br />{parts.toUpperCase()}</span>
    </Link>
  );
}

const stamped = new Set<string>(); // the stamp settles once per grade per visit
export function GradeMark({ g, size = "sm" }: { g: string | null; size?: "sm" | "lg" }) {
  const key = `${g}-${size}`;
  const [play] = useState(() => !stamped.has(key));
  useEffect(() => { stamped.add(key); }, [key]);
  const box = size === "lg" ? "size-14 text-26" : "size-9 text-17";
  return (
    <span aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-[4px] border-[1.5px] font-serif leading-none font-bold ${box} ${g ? "border-ink text-ink" : "border-rule text-ink-3"} ${play ? "animate-stamp" : ""}`}>
      {g ?? "–"}
    </span>
  );
}

// The fold: only P2/P3 filings (every P1 already has its own "Also" line).
const folded = (g: Group) => g.more.filter((i) => i.tier !== "P1");

function More({ g }: { g: Group }) {
  const [open, setOpen] = useState(false);
  const rest = folded(g);
  if (!rest.length) return null;
  return (
    <div className="border-t border-rule">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="press flex min-h-11 w-full items-center justify-between gap-3 text-left text-13 font-semibold text-accent">
        {open ? "Hide" : `${rest.length} more ${rest.length === 1 ? "filing" : "filings"}`}
        <Chevron open={open} />
      </button>
      <Collapse open={open}><ol className="border-t border-rule">{rest.map((i) => <FeedRow key={i.id} item={i} />)}</ol></Collapse>
    </div>
  );
}

// Expanded body: the lead's detail, results documents, the material filings behind the "Also" lines, then the fold.
function Body({ g }: { g: Group }) {
  const also = material(g);
  return (
    <div className="mt-3 border-t border-rule pt-3">
      <Detail i={g.lead} />
      {also.length > 0 && (
        <div className="mt-4">
          <p className="kicker">Also material</p>
          <ol className="mt-1 border-t border-rule">{also.map((i) => <FeedRow key={i.id} item={i} />)}</ol>
        </div>
      )}
      {g.docs.length > 0 && (
        <div className="mt-4">
          <p className="kicker">Filed with the results</p>
          <ul className="mt-1 text-13">
            {g.docs.map((d) => (
              <li key={d.id} className="flex min-h-11 items-center gap-3 border-t border-rule">
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noopener" className="min-w-0 truncate font-semibold text-accent">{title(d)}</a>
                ) : (
                  <span className="min-w-0 truncate">{title(d)}</span>
                )}
                <span className="ml-auto shrink-0 font-mono text-11 text-ink-3">{filedAt(d.filed).toUpperCase()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3"><More g={g} /></div>
    </div>
  );
}

// Every material filing that isn't the lead, grouped by event type (newest first inside each), so a CEO change
// can't hide under results and a 9-filing QIP doesn't stack 9 lines (user, 13 Nov).
function alsoGroups(g: Group): RankedItem[][] {
  const by = new Map<string, RankedItem[]>(); // g.more is already in lead order, so groups come out ranked
  for (const i of g.more) if (i.tier === "P1") by.set(i.category, [...(by.get(i.category) ?? []), i]);
  return [...by.values()].map((l) => [...l].sort((a, b) => b.filed.localeCompare(a.filed)));
}
const material = (g: Group) => alsoGroups(g).flat();

// One line per event type: "Also · Fund raise · 4 filings · <latest>". The count leads so it survives truncation.
function AlsoMaterial({ g }: { g: Group }) {
  const groups = alsoGroups(g);
  if (!groups.length) return null;
  return (
    <ul className="mt-3 space-y-1 text-13 leading-[1.35] text-ink-2">
      {groups.map((l) => (
        <li key={l[0].category} className="truncate">
          <span className="kicker text-ink">Also</span> · {eventLabel(l[0])}
          {l.length > 1 && <> · <span className="font-mono">{l.length}</span> filings</>} · <Signed text={title(l[0])} />
        </li>
      ))}
    </ul>
  );
}

// Opened from an alert (/?open=SYMBOL): expand and bring into view.
function useDeepOpen(initialOpen: boolean, setOpen: (v: boolean) => void) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!initialOpen) return;
    setOpen(true);
    ref.current?.scrollIntoView({ block: "start" });
  }, [initialOpen, setOpen]);
  return ref;
}

// Kicker: RESULTS · TATA POWER, date on the right; one line. A long name gives way to its ticker.
function Kicker({ g, co }: { g: Group; co?: Co }) {
  const i = g.lead;
  const name = shortName(co?.name ?? i.name);
  return (
    <p className="kicker flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="shrink-0">{eventLabel(i)} ·</span>
      <Link href={`/research?symbol=${g.symbol}`} className="relative z-10 min-w-0 truncate text-ink after:absolute after:-inset-y-3.5 after:-inset-x-1 after:content-[''] active:text-accent">
        {name.length > 22 ? <span className="font-mono tracking-normal">{g.symbol}</span> : name}
      </Link>
      <span className="ml-auto shrink-0 pl-2 font-mono font-normal tracking-normal">{filedAt(i.filed).toUpperCase()}</span>
    </p>
  );
}

// A story on the front page. The lead is raised with a sector-tint edge and the full set: deck, numbers + sparkline,
// stamp, reaction, Also lines. Secondaries are separated by hairlines: kicker, headline, numbers + sparkline.
// Only the headline is the toggle; a stretched ::after overlay keeps the whole story tappable.
export function Story({ g, co, nifty, end, lead = false, initialOpen = false }: {
  g: Group; co?: Co; nifty?: [string, number][]; end: string; lead?: boolean; initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDeepOpen(initialOpen, setOpen);
  const i = g.lead;
  const pending = !i.reaction && !!i.last_bar && i.reaction_day > i.last_bar;
  const deck = lead ? deckOf(i) : null;
  const id = `s-${g.symbol}`;
  const spark = co?.closes && <Sparkline sym={g.symbol} closes={co.closes} nifty={nifty} mark={i.reaction ? i.reaction_day : undefined} pending={pending} end={end} />;
  return (
    <li ref={ref}
      style={lead ? { borderLeftColor: tint(co?.sector) } : undefined}
      className={`relative scroll-mt-4 transition-[scale] duration-[90ms] ease-in has-[h3_button:active]:scale-[0.985] ${lead ? "rounded-[4px] border border-l-[3px] border-rule bg-paper-raised px-4 pt-3 pb-2" : "border-b border-rule py-4"}`}>
      <Kicker g={g} co={co} />
      <h3 className={`mt-2 font-serif font-semibold tracking-[-0.01em] text-balance text-ink ${lead ? "text-26 leading-[1.1]" : "text-20 leading-[1.15]"}`}>
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
          className="text-left after:absolute after:inset-0 after:content-['']">
          <span className="sr-only">{shortName(co?.name ?? i.name)}: </span>
          <Signed text={headlineOf(i)} />
        </button>
      </h3>
      {deck && <p className="mt-2 line-clamp-2 text-15 leading-[1.4] text-ink-2"><Signed text={deck} /></p>}
      {(i.card || spark) && (
        <div className={`mt-3 flex items-end justify-between gap-3 ${spark ? "mb-5" : ""}`}>
          <Numbers i={i} />
          {spark}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Reaction g={g} />
        {i.card?.type === "results" && <Stamp sym={g.symbol} co={co} />}
      </div>
      <AlsoMaterial g={g} />
      <div className="relative z-10">
        <Collapse open={open} id={id}><Body g={g} /></Collapse>
      </div>
      {lead && (
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
          className="press relative z-10 mt-1 flex min-h-11 w-full items-center justify-end gap-1 rounded-[4px] text-13 font-semibold text-accent">
          {open ? "Close" : "Full story"} <Chevron open={open} />
        </button>
      )}
    </li>
  );
}

// "In brief": one dense line per company (kicker · headline · date); tap to open the same detail.
export function BriefLine({ g, co, initialOpen = false }: { g: Group; co?: Co; initialOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useDeepOpen(initialOpen, setOpen);
  const i = g.lead;
  const r = reactionOf(g);
  const id = `b-${g.symbol}`;
  return (
    <li ref={ref} className="scroll-mt-4 border-b border-rule">
      <div className="press relative py-3">
        <p className="flex items-baseline gap-2">
          <span className="w-[5.5rem] shrink-0 truncate font-mono text-13 font-semibold text-ink">{g.symbol}</span>
          <span className="kicker min-w-0 truncate">{eventLabel(i)}{folded(g).length > 0 && ` +${folded(g).length}`}</span>
          <span className="ml-auto shrink-0 font-mono text-11 text-ink-3">{shortDate(i.filed).toUpperCase()}</span>
        </p>
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
          className="mt-1 line-clamp-2 w-full pl-[6rem] text-left text-15 leading-[1.35] text-ink after:absolute after:inset-0 after:content-['']">
          <span className="sr-only">{shortName(co?.name ?? i.name)}: </span>
          <Signed text={headlineOf(i)} />
        </button>
        {r && (
          <p className={`mt-1 pl-[6rem] font-mono text-11 ${r.strong ? "font-semibold text-ink" : "text-ink-3"}`}><Signed text={r.text} arrows /></p>
        )}
      </div>
      <Collapse open={open} id={id}><div className="pb-3"><Body g={g} /></div></Collapse>
    </li>
  );
}
