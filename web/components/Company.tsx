"use client";
import { useState } from "react";
import { filedAt, shortDate, type Company as Co, type RankedItem } from "@/lib/feed";
import type { Group } from "@/lib/group";
import { period } from "@/lib/period";
import { pct } from "@/lib/rank";
import { crore, Detail, eventLabel, FeedRow, reasonText, title } from "./FeedRow";
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

export function Avatar({ name, sector, size = "md" }: { name: string; sector?: string | null; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      style={tint(sector)}
      className={`grid shrink-0 place-items-center rounded-[0.6rem] font-semibold tracking-[0.02em] ${size === "md" ? "size-10 text-[0.875rem]" : "size-8 text-[0.75rem]"}`}
    >
      {monogram(name)}
    </span>
  );
}

// ---- 30-day sparkline with the filing's reaction day marked ----
function Spark({ closes, mark, end }: { closes: [string, number][]; mark?: string; end: string }) {
  const since = new Date(Date.parse(end) - 30 * 864e5).toISOString().slice(0, 10);
  const pts = closes.filter(([d]) => d >= since && d <= end);
  if (pts.length < 5) return null;
  const vs = pts.map((p) => p[1]);
  const lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
  const x = (k: number) => (k / (pts.length - 1)) * 100;
  const y = (v: number) => 30 - ((v - lo) / span) * 26;
  const line = pts.map((p, k) => `${x(k).toFixed(2)},${y(p[1]).toFixed(2)}`).join(" ");
  const mk = mark ? pts.findIndex(([d]) => d >= mark) : -1;
  const chg = ((vs[vs.length - 1] - vs[0]) / vs[0]) * 100;
  return (
    <div className="mt-3 flex items-center gap-3">
      <div className="relative h-8 flex-1">
        <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
          <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.25" vectorEffect="non-scaling-stroke" className="text-ink-2" />
        </svg>
        {mk >= 0 && (
          <>
            <span className="absolute inset-y-0 w-px bg-accent/40" style={{ left: `${x(mk)}%` }} />
            <span
              className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-[2px] bg-accent ring-2 ring-card"
              style={{ left: `${x(mk)}%`, top: `${(y(vs[mk]) / 32) * 100}%` }}
            />
          </>
        )}
      </div>
      <span className="shrink-0 text-[0.75rem] text-ink-2">
        30d <Signed text={pct(chg)} />
      </span>
      <span className="sr-only">
        Price over 30 days {pct(chg)}{mk >= 0 ? `, filing reaction day ${shortDate(pts[mk][0])} marked` : ""}.
      </span>
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
  return title(i);
}

function Numbers({ i }: { i: RankedItem }) {
  if (i.card?.type !== "results") return i.note ? <p className="mt-1.5 text-[0.8125rem] text-ink-2">{i.note}</p> : null;
  const ls = [i.card.lines[0], i.card.lines[i.card.lines.length - 1]];
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4">
      {ls.map((l) => (
        <div key={l.name} className="min-w-0">
          <dt className="truncate text-[0.75rem] text-ink-2">{l.name.replace(/ \(to owners\)$/, "")}</dt>
          <dd className="text-[1rem] font-semibold">₹{crore(l.value)} cr</dd>
          <dd className="text-[0.8125rem]">{l.yoy_pct != null ? <><Signed text={pct(l.yoy_pct)} /> <span className="text-ink-2">YoY</span></> : <span className="text-ink-2">YoY not disclosed</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

// The market's verdict for the company: the filing that moved it, else the lead's reaction. Nothing while pending.
function chipOf(g: Group): { text: string; strong: boolean } | null {
  const it = [g.lead, ...g.docs, ...g.more].find((i) => i.boosted) ?? g.lead;
  const r = reasonText(it);
  if (!r || r === "Reaction pending" || r === "No price data") return null;
  return { text: r, strong: it.boosted };
}

function Chip({ c }: { c: { text: string; strong: boolean } }) {
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.75rem] leading-[1.1rem] whitespace-nowrap ${c.strong ? "border-ink/50 font-semibold" : "border-rule text-ink-2"}`}>
      {c.strong && <span className="sr-only">Ranked high: </span>}
      <Signed text={c.text} />
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={`size-4 shrink-0 text-ink-2 ${open ? "rotate-180" : ""}`} aria-hidden="true">
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Expanded body: the lead's detail, results documents, then the other filings as compact rows.
function Body({ g }: { g: Group }) {
  return (
    <div className="mt-3 border-t border-rule pt-2">
      <Detail i={g.lead} />
      {g.docs.length > 0 && (
        <div className="mt-3">
          <p className="text-[0.8125rem] font-medium">Filed with the results</p>
          <ul className="mt-1 space-y-1 text-[0.8125rem]">
            {g.docs.map((d) => (
              <li key={d.id} className="flex gap-3">
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
    </div>
  );
}

function More({ g }: { g: Group }) {
  const [open, setOpen] = useState(false);
  if (!g.more.length) return null;
  return (
    <>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-11 w-full items-center justify-between text-left text-[0.8125rem] font-medium text-accent">
        {open ? "Hide" : `+${g.more.length} more ${g.more.length === 1 ? "filing" : "filings"}`}
        <Chevron open={open} />
      </button>
      {open && <ol className="border-t border-rule">{g.more.map((i) => <FeedRow key={i.id} item={i} />)}</ol>}
    </>
  );
}

// "What matters": a rich card per company.
export function CompanyCard({ g, co, end }: { g: Group; co?: Co; end: string }) {
  const [open, setOpen] = useState(false);
  const i = g.lead;
  const chip = chipOf(g);
  const id = `c-${g.symbol}`;
  return (
    <li className="rounded-xl border border-rule bg-card">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="block w-full rounded-xl px-4 pt-3.5 pb-3 text-left active:bg-paper-2/60">
        <span className="flex items-center gap-3">
          <Avatar name={co?.name ?? i.name} sector={co?.sector} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.9375rem] font-semibold">{shortName(co?.name ?? i.name)}</span>
            <span className="block truncate text-[0.8125rem] text-ink-2">{g.symbol} · {eventLabel(i)} · {filedAt(i.filed)}</span>
          </span>
          {chip && <Chip c={chip} />}
        </span>
        <span className="mt-3 block text-[1.0625rem] leading-[1.35] font-semibold text-balance">
          <Signed text={headlineOf(i)} />
        </span>
        <Numbers i={i} />
        {co?.closes && <Spark closes={co.closes} mark={i.reaction ? i.reaction_day : undefined} end={end} />}
        <span className="mt-2 flex items-center justify-end gap-1 text-[0.75rem] text-ink-2">
          {open ? "Less" : "Details"} <Chevron open={open} />
        </span>
      </button>
      <div className="px-4">
        {open && <div id={id} className="pb-3"><Body g={g} /></div>}
        {g.more.length > 0 && <div className="border-t border-rule"><More g={g} /></div>}
      </div>
    </li>
  );
}

// "Also worth a look": a compact row per company.
export function CompanyRow({ g, co }: { g: Group; co?: Co }) {
  const [open, setOpen] = useState(false);
  const i = g.lead;
  const chip = chipOf(g);
  const id = `r-${g.symbol}`;
  return (
    <li className="border-b border-rule">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 py-3 text-left active:bg-paper-2">
        <Avatar name={co?.name ?? i.name} sector={co?.sector} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="shrink-0 text-[0.875rem] font-semibold">{shortName(co?.name ?? i.name)}</span>
            <span className="min-w-0 truncate text-[0.8125rem] text-ink-2">{eventLabel(i)}{g.more.length > 0 && ` +${g.more.length}`}</span>
            {chip && <span className={`ml-auto shrink-0 text-[0.75rem] ${chip.strong ? "font-semibold" : "text-ink-2"}`}><Signed text={chip.text} /></span>}
          </span>
          <span className="mt-0.5 flex items-baseline gap-3 text-[0.875rem]">
            <span className="min-w-0 truncate"><Signed text={headlineOf(i)} /></span>
            <span className="ml-auto shrink-0 text-[0.75rem] text-ink-2">{shortDate(i.filed)}</span>
          </span>
        </span>
      </button>
      {open && (
        <div id={id} className="pb-2">
          <Body g={g} />
          <More g={g} />
        </div>
      )}
    </li>
  );
}
