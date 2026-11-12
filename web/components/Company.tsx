"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { filedAt, shortDate, type Company as Co, type Credibility, type RankedItem } from "@/lib/feed";
import type { Group } from "@/lib/group";
import { period } from "@/lib/period";
import { pct } from "@/lib/rank";
import { Chevron, Collapse } from "./Collapse";
import { crore, Detail, eventLabel, FeedRow, keyFact, reasonText, title } from "./FeedRow";
import { Signed } from "./Signed";

// ---- identity: short name, monogram, sector tint (derived from screener's sector, never per-ticker) ----
export const shortName = (name: string) =>
  name.replace(/\s*\((India|I)\)\s*/i, " ").replace(/\s+(Company\s+)?(Ltd\.?|Limited)$/i, "").replace(/^The\s+/i, "").trim();

const monogram = (name: string) => {
  const w = shortName(name).replace(/[^A-Za-z0-9& ]/g, "").split(/\s+/).filter((x) => x && x !== "&");
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] ?? "?").slice(0, 2)).toUpperCase();
};

const HUES = [28, 62, 96, 150, 188, 226, 262, 318];
function tint(sector: string | null | undefined) {
  if (!sector) return { background: "var(--color-paper-2)", color: "var(--color-ink-2)" };
  let h = 0;
  for (const c of sector) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = HUES[h % HUES.length];
  return { background: `oklch(91.5% 0.035 ${hue})`, color: `oklch(36% 0.07 ${hue})` };
}

export function Avatar({ name, sector }: { name: string; sector?: string | null }) {
  return (
    <span aria-hidden="true" style={tint(sector)}
      className="grid size-8 shrink-0 place-items-center rounded-[0.5rem] text-[0.75rem] font-semibold tracking-[0.02em]">
      {monogram(name)}
    </span>
  );
}

// ---- 30-day sparkline: the stock, Nifty rebased to the same start (faint), and the filing's reaction day ----
const drawn = new Set<string>(); // draw-in plays once per company per visit, not on every window switch

function Spark({ sym, closes, nifty, mark, pending, end }: {
  sym: string; closes: [string, number][]; nifty?: [string, number][]; mark?: string; pending: boolean; end: string;
}) {
  const [animate] = useState(() => !drawn.has(sym));
  useEffect(() => { drawn.add(sym); }, [sym]);
  const since = new Date(Date.parse(end) - 30 * 864e5).toISOString().slice(0, 10);
  const pts = closes.filter(([d]) => d >= since && d <= end);
  if (pts.length < 5) return null;
  const s = pts.map(([, c]) => c / pts[0][1] - 1);
  // Nifty on the same dates (carry the last close over a missing day), rebased to the stock's first day
  const nm = new Map(nifty ?? []);
  let last: number | undefined;
  const nv = pts.map(([d]) => (last = nm.get(d) ?? last));
  const n0 = nv.find((v) => v != null);
  const n = n0 ? nv.map((v) => (v == null ? null : v / n0 - 1)) : [];
  const all = [...s, ...n.filter((v): v is number => v != null)];
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const slots = pts.length + (pending ? 1 : 0); // a pending reaction sits one trading day past the last bar
  const x = (k: number) => (k / (slots - 1)) * 100;
  const y = (v: number) => 26 - ((v - lo) / span) * 23;
  const line = (vs: (number | null)[]) => vs.map((v, k) => (v == null ? "" : `${x(k).toFixed(2)},${y(v).toFixed(2)}`)).filter(Boolean).join(" ");
  const mk = pending ? pts.length : mark ? pts.findIndex(([d]) => d >= mark) : -1;
  const my = mk >= 0 ? y(s[Math.min(mk, s.length - 1)]) : 0;
  const chg = s[s.length - 1] * 100;
  const nchg = n.length && n[n.length - 1] != null ? n[n.length - 1]! * 100 : null;
  return (
    <div className="w-[7.75rem] shrink-0">
      <p className="text-right text-[0.75rem] leading-4 text-ink-2" aria-hidden="true">30 days</p>
      <div className={`relative h-7 ${animate ? "animate-draw" : ""}`}>
        <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
          {n.length > 0 && <polyline points={line(n)} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" className="text-ink-2/35" />}
          <polyline points={line(s)} fill="none" stroke="currentColor" strokeWidth="1.25" vectorEffect="non-scaling-stroke" className="text-ink" />
        </svg>
        {mk >= 0 && (
          <>
            <span className="absolute inset-y-0 w-px bg-accent/30" style={{ left: `${x(mk)}%` }} />
            <span
              className={`absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-[2px] ring-2 ring-card ${pending ? "border-2 border-accent bg-card" : "bg-accent"}`}
              style={{ left: `${x(mk)}%`, top: `${(my / 28) * 100}%` }}
            />
          </>
        )}
      </div>
      <p className="mt-1 text-right text-[0.75rem] leading-4 whitespace-nowrap text-ink-2">
        <span className="sr-only">30 days: </span>
        <Signed text={pct(chg)} />{nchg != null && <> · Nifty {pct(nchg)}</>}
        <span className="sr-only">
          {mk >= 0 ? (pending ? ". Filing day marked; reaction not in yet." : `. Filing reaction day ${shortDate(pts[mk][0])} marked.`) : ""}
        </span>
      </p>
    </div>
  );
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

const SHORT: Record<string, string> = { Revenue: "Rev", "Total income": "Income", "PAT (to owners)": "PAT" };

const hasNumbers = (i: RankedItem) =>
  i.card?.type === "results" || (i.card?.type === "fund_raise" && (i.card.size_cr != null || i.card.dilution_pct != null));

// Two figures only, label / value / change; the full table is one tap away.
function Numbers({ i }: { i: RankedItem }) {
  const c = i.card;
  let rows: [string, string, React.ReactNode][] = [];
  let head = "";
  if (c?.type === "results") {
    head = "YoY";
    rows = [c.lines[0], c.lines[c.lines.length - 1]].map((l) => [
      SHORT[l.name] ?? l.name, l.value == null ? "not disclosed" : `₹${crore(l.value)} cr`,
      l.yoy_pct == null ? <span className="text-ink-2">–</span> : <Signed text={pct(l.yoy_pct)} />,
    ]);
  } else if (c?.type === "fund_raise") {
    if (c.size_cr != null) rows.push(["Size", `₹${crore(c.size_cr)} cr`, ""]);
    if (c.dilution_pct != null) rows.push(["Dilution", `${c.dilution_pct.toFixed(1)}%`, ""]);
  }
  if (!rows.length) return null;
  return (
    <table className="min-w-0 border-collapse text-[0.8125rem] leading-5 @max-[15rem]:block @max-[15rem]:[&_thead]:sr-only @max-[15rem]:[&_tbody]:block @max-[15rem]:[&_tr]:flex @max-[15rem]:[&_tr]:flex-wrap">
      {head && (
        <thead>
          <tr className="text-[0.75rem] leading-4 text-ink-2">
            <th scope="col"><span className="sr-only">Line</span></th>
            <th scope="col"><span className="sr-only">This quarter</span></th>
            <th scope="col" className="text-right font-normal">{head}</th>
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map(([k, v, d]) => (
          <tr key={k}>
            <th scope="row" className="pr-2.5 text-left font-normal text-ink-2">{k}</th>
            <td className="pr-2.5 font-semibold whitespace-nowrap">{v}</td>
            <td className="text-right whitespace-nowrap">{d}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// The market's verdict for the company: the filing that moved it, else the lead's reaction. Nothing while pending.
function chipOf(g: Group): { text: string; strong: boolean; day?: string } | null {
  const it = [g.lead, ...g.docs, ...g.more].find((i) => i.boosted) ?? g.lead;
  const r = reasonText(it);
  if (!r || r === "Reaction pending" || r === "No price data") return null;
  const x = it.reaction;
  // a volume-only crossing still says which way the stock went
  const text = it.boosted && !r.includes("%") && x ? `${pct(x.excess_pct ?? x.move_pct)}${x.excess_pct != null ? " vs Nifty" : ""} · ${r}` : r;
  return { text, strong: it.boosted, day: x ? shortDate(it.reaction_day) : undefined }; // rows already show a date
}

function Chip({ c }: { c: { text: string; strong: boolean; day?: string } }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[0.75rem] leading-[1.1rem] ${c.strong ? "border-ink/50 font-semibold" : "border-rule text-ink-2"}`}>
      {c.strong && <span className="sr-only">Ranked high: </span>}
      <Signed text={c.day ? `${c.day} · ${c.text}` : c.text} />
    </span>
  );
}

// Management's record on its own concall promises (Promised vs Delivered), measured promises only.
function Credible({ sym, c }: { sym: string; c: Credibility }) {
  const parts = [`Kept ${c.kept}`, `Missed ${c.missed}`, c.open > 0 && `Open ${c.open}`].filter(Boolean).join(" · ");
  const shown = `Promises: ${parts}`;
  return (
    <Link
      href={`/research?symbol=${sym}`}
      aria-label={`Management promises, last 4 calls: ${parts}. Open research`}
      className="relative z-10 rounded-full border border-rule px-2 py-0.5 text-[0.75rem] leading-[1.1rem] font-medium text-accent after:absolute after:-inset-y-2.5 after:inset-x-0 after:content-[''] active:bg-paper-2"
    >
      {shown}
    </Link>
  );
}

// The fold: only P2/P3 filings (every P1 already has its own "Also:" line).
const folded = (g: Group) => g.more.filter((i) => i.tier !== "P1");

function More({ g }: { g: Group }) {
  const [open, setOpen] = useState(false);
  const rest = folded(g);
  if (!rest.length) return null;
  return (
    <div className="border-t border-rule">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-[0.8125rem] font-medium text-accent">
        {open ? "Hide" : `+${rest.length} more ${rest.length === 1 ? "filing" : "filings"}`}
        <Chevron open={open} />
      </button>
      <Collapse open={open}><ol className="border-t border-rule">{rest.map((i) => <FeedRow key={i.id} item={i} />)}</ol></Collapse>
    </div>
  );
}

// Expanded body: the lead's detail, results documents, the material filings behind the "Also" lines
// (full title, detail and source on tap), then the folded P2/P3 filings.
function Body({ g }: { g: Group }) {
  const also = material(g);
  return (
    <div className="mt-3 border-t border-rule pt-2">
      <Detail i={g.lead} />
      {also.length > 0 && (
        <div className="mt-3">
          <p className="text-[0.8125rem] font-medium">Also material</p>
          <ol className="mt-1 border-t border-rule">{also.map((i) => <FeedRow key={i.id} item={i} />)}</ol>
        </div>
      )}
      {g.docs.length > 0 && (
        <div className="mt-3">
          <p className="text-[0.8125rem] font-medium">Filed with the results</p>
          <ul className="mt-1 space-y-1 text-[0.8125rem]">
            {g.docs.map((d) => (
              <li key={d.id} className="flex min-h-11 items-center gap-3">
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noopener" className="min-w-0 truncate text-accent underline">{title(d)}</a>
                ) : (
                  <span className="min-w-0 truncate">{title(d)}</span>
                )}
                <span className="ml-auto shrink-0 text-ink-2">{filedAt(d.filed)}</span>
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
    <ul className="mt-2 space-y-0.5 text-[0.8125rem] leading-[1.35] text-ink-2">
      {groups.map((l) => (
        <li key={l[0].category} className="truncate">
          <span className="font-medium">Also</span> · {eventLabel(l[0])}
          {l.length > 1 && <> · {l.length} filings</>} · <Signed text={title(l[0])} />
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

// "What matters": one card per company. Headline dominates; company is second; event and time are third.
// Only the headline is the toggle (its name is the headline); a stretched ::after overlay keeps the whole
// card tappable without nesting lists inside a button. Links and the fold sit above the overlay (z-10).
export function CompanyCard({ g, co, nifty, end, initialOpen = false }: {
  g: Group; co?: Co; nifty?: [string, number][]; end: string; initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDeepOpen(initialOpen, setOpen);
  const i = g.lead;
  const chip = chipOf(g);
  const cred = i.card?.type === "results" ? co?.credibility : null;
  const pending = !i.reaction && !!i.last_bar && i.reaction_day > i.last_bar;
  const nums = hasNumbers(i);
  const chips = (chip || cred) && (
    <div className="flex flex-wrap items-center gap-1.5">
      {chip && <Chip c={chip} />}
      {cred && <Credible sym={g.symbol} c={cred} />}
    </div>
  );
  const id = `c-${g.symbol}`;
  return (
    <li ref={ref}
      className="@container relative scroll-mt-4 rounded-xl border border-rule bg-card px-4 pt-3 pb-3.5 transition-[scale,background-color] duration-150 ease-out has-[h3_button:active]:scale-[0.99] has-[h3_button:active]:bg-paper-2/50">
      <div className="flex items-center gap-2.5">
        <Avatar name={co?.name ?? i.name} sector={co?.sector} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-[0.875rem] font-medium">{shortName(co?.name ?? i.name)}</p>
          <p className="text-[0.75rem] text-ink-2 [overflow-wrap:anywhere]">{g.symbol} · {eventLabel(i)} · {filedAt(i.filed)}</p>
        </div>
        <Chevron open={open} />
      </div>
      <h3 className="mt-2 text-[1.125rem] leading-[1.3] font-semibold text-balance">
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
          className="text-left @min-[15rem]:line-clamp-3 after:absolute after:inset-0 after:rounded-xl after:content-['']">
          <span className="sr-only">{shortName(co?.name ?? i.name)}: </span>
          <Signed text={headlineOf(i)} />
        </button>
      </h3>
      {(nums || co?.closes) && (
        <div className="mt-2.5 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
          {nums ? <Numbers i={i} /> : <div className="min-w-0 self-center">{chips}</div>}
          {co?.closes && <Spark sym={g.symbol} closes={co.closes} nifty={nifty} mark={i.reaction ? i.reaction_day : undefined} pending={pending} end={end} />}
        </div>
      )}
      {(nums || !co?.closes) && chips && <div className="mt-2.5">{chips}</div>}
      <AlsoMaterial g={g} />
      <div className="relative z-10">
        <Collapse open={open} id={id}><Body g={g} /></Collapse>
      </div>
    </li>
  );
}

// "Also worth a look": a compact row per company (the button holds only inline text). Headlines wrap to 2 lines.
export function CompanyRow({ g, co, initialOpen = false }: { g: Group; co?: Co; initialOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useDeepOpen(initialOpen, setOpen);
  const i = g.lead;
  const chip = chipOf(g);
  const id = `r-${g.symbol}`;
  return (
    <li ref={ref} className="scroll-mt-4 border-b border-rule">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
        className="flex w-full items-start gap-3 py-3 text-left transition-colors duration-150 ease-out active:bg-paper-2">
        <Avatar name={co?.name ?? i.name} sector={co?.sector} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[0.875rem] font-medium">{shortName(co?.name ?? i.name)}</span>
            <span className="shrink-0 text-[0.75rem] text-ink-2">{eventLabel(i)}{folded(g).length > 0 && ` +${folded(g).length}`}</span>
            {chip && <span className={`ml-auto shrink-0 text-[0.75rem] ${chip.strong ? "font-semibold" : "text-ink-2"}`}><Signed text={chip.text} /></span>}
          </span>
          <span className="mt-0.5 flex items-start gap-x-3 text-[0.875rem] leading-[1.35]">
            <span className="line-clamp-2 min-w-0 flex-1"><Signed text={headlineOf(i)} /></span>
            <span className="shrink-0 pt-px text-[0.75rem] text-ink-2">{shortDate(i.filed)}</span>
          </span>
        </span>
      </button>
      <Collapse open={open} id={id}>
        <div className="pb-2">
          <Body g={g} />
        </div>
      </Collapse>
    </li>
  );
}
