"use client";
import { useState } from "react";
import { filedAt, sentence, shortDate, type FundCard, type Item, type MgmtCard, type RankedItem, type ResultsCard, type ResultsLine } from "@/lib/feed";
import { label, pct } from "@/lib/rank";
import { Signed } from "./Signed";
import { period } from "@/lib/period";
import { Collapse } from "./Collapse";

// What the row says before you tap: numbers-first for results, the person for mgmt changes, else the filing's own line.
// Results use one basis (YoY) so two figures are never compared across different periods; the table has QoQ.
export function keyFact(i: Item): string {
  const c = i.card;
  if (c?.type === "results") {
    const bit = (l: ResultsLine | undefined) =>
      l?.yoy_pct != null ? `${l.name.replace(/^Revenue$/, "Rev").replace(/ \(to owners\)$/, "")} ${pct(l.yoy_pct)}` : null;
    const s = [bit(c.lines[0]), bit(c.lines[c.lines.length - 1])].filter(Boolean).join(" · ");
    if (s) return `${s} YoY`;
  }
  if (i.title) return i.title;
  if (c?.type === "management_change" && c.people[0]) {
    const p = c.people[0];
    return `${p.name} ${p.change}${p.role ? `, ${p.role}` : ""}`;
  }
  return title(i);
}

// The human one-liner from ingest (cheap model, numbers copied from the filing), else the exchange subject
// with its boilerplate stripped by rule.
export function title(i: Item): string {
  if (i.title) return rupee(i.title);
  const raw = i.headline || i.subject || "Filing";
  const clean = raw
    .replace(/^Announcement under Regulation 30 \(LODR\)-?\s*/i, "")
    .replace(/^(Regulation 30\s*|Press Release Titled\s*|Disclosure under Regulation 30[^-:]*[-:]?\s*)/i, "")
    .replace(/^"(.*)"\.?$/, "$1")
    .trim();
  return rupee(clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : raw);
}

// Filings write Rs. / INR; the app writes ₹ (display only, the data keeps the filing's text)
const rupee = (s: string) => s.replace(/\b(?:Rs\.?|INR)\s?(?=\d)/g, "₹");

// rank() reasons start with the category, which line 1 already shows. On the row, a move that crossed
// the threshold shows only its vs-Nifty part (the part that triggered it); the expanded view has the full string.
export function reasonText(i: RankedItem): string {
  const lab = label(i.category);
  if (!i.boosted) return i.reason.slice(`${lab} · `.length);
  return i.reason
    .slice(`Ranked high: ${lab} · `.length)
    .replace(/[+−]\d+\.\d% \(([+−]\d+\.\d%) vs Nifty\)/, "$1 vs Nifty")
    .replace("× volume", "× vol");
}

const SHORT_LABEL: Record<string, string> = { management_change: "Mgmt change" };

// Line-1 event name. Results filings without figures that aren't P1 (decks, re-filings) say so, so their rank reads.
export function eventLabel(i: Item): string {
  if (i.category === "results" && !i.card && i.tier !== "P1") return "Results doc";
  return SHORT_LABEL[i.category] ?? sentence(label(i.category));
}

export function FeedRow({ item: i }: { item: RankedItem }) {
  const [open, setOpen] = useState(false);
  const reason = reasonText(i);
  // "Reaction pending" is said once, in the Brief's banner, not on every row
  const shownReason = reason === "Reaction pending" ? "" : reason;
  const quietReason = !i.boosted && reason === "No price data";
  const id = `row-${i.id}`;
  return (
    <li className="border-b border-rule last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="press block w-full py-3 text-left"
      >
        {/* line 1: who, what, and the market's verdict (single line); line 2: the fact (wraps to 2 lines) and when. */}
        <span className="flex items-baseline gap-2 whitespace-nowrap">
          <span className="shrink-0 font-mono text-13 font-semibold">{i.symbol}</span>
          <span className="kicker shrink-0">{eventLabel(i)}</span>
          {i.tier === "P1" && (
            <span className="inline-block size-[0.4375rem] shrink-0 -translate-y-px bg-accent" role="img" aria-label="Material" />
          )}
          {/* Each reason part is a unit; one that doesn't fit wraps onto the clipped second line, so a part is dropped whole, never cut. */}
          <span className={`ml-auto flex h-5 min-w-0 flex-wrap justify-end gap-x-1 overflow-hidden pl-2 font-mono text-11 leading-5 ${quietReason ? "text-ink-3" : i.boosted ? "font-semibold" : "text-ink-3"}`}>
            {i.boosted && <span className="sr-only">Ranked high: </span>}
            {shownReason && shownReason.split(" · ").map((u, k) => (
              <span key={k}>{k > 0 && "· "}<Signed text={u} arrows /></span>
            ))}
          </span>
        </span>
        <span className="mt-1 flex items-start gap-3 text-15 leading-[1.4] text-ink-2">
          <span className="line-clamp-2 min-w-0"><Signed text={keyFact(i)} /></span>
          <span className="ml-auto shrink-0 pt-0.5 font-mono text-11 whitespace-nowrap text-ink-3">{filedAt(i.filed)}</span>
        </span>
      </button>
      <Collapse open={open} id={id}><div className="pb-4"><Detail i={i} /></div></Collapse>
    </li>
  );
}

export function Detail({ i }: { i: RankedItem }) {
  return (
    <div className="pt-1 text-15 leading-[1.45] text-ink-2">
      {i.card?.type === "results" ? <Results c={i.card} /> : i.card?.type === "management_change" ? <Mgmt c={i.card} />
        : i.card?.type === "fund_raise" ? <Fund c={i.card} i={i} /> : <Other i={i} />}
      <Why i={i} />
      <Source i={i} page={i.card?.type === "results" ? i.card.pages[0] : i.card?.type === "fund_raise" ? i.card.size_page ?? undefined : undefined} />
    </div>
  );
}

function Why({ i }: { i: RankedItem }) {
  const day = i.reaction ? ` on ${shortDate(i.reaction_day)}` : "";
  return (
    <p className="mt-3 text-13 text-ink-2">
      <span className="kicker mr-1">Why it&rsquo;s here</span>
      <Signed text={i.reason.replace(/^Ranked high: /, "ranked high: ").replace("Reaction pending", "market reaction not in yet")} />
      {day}
    </p>
  );
}

export const crore = (v: number | null) =>
  v == null ? "not disclosed" : v.toLocaleString("en-IN", { maximumFractionDigits: Math.abs(v) < 100 ? 1 : 0 });

function Change({ v }: { v: number | null }) {
  return v == null ? <span className="text-ink-3">–</span> : <Signed text={pct(v)} />;
}

function Results({ c }: { c: ResultsCard }) {
  return (
    <>
      <table className="w-full border-collapse font-mono text-13 text-ink">
        <caption className="kicker pb-2 text-left">
          {sentence(c.basis)} · {c.unit}
        </caption>
        <thead>
          <tr className="text-11 text-ink-3">
            <th scope="col" className="pb-1 text-left font-normal"><span className="sr-only">Line</span></th>
            <th scope="col" className="pb-1 text-right font-normal">{period(c.periods[0])}</th>
            <th scope="col" className="pb-1 text-right font-normal">QoQ</th>
            <th scope="col" className="pb-1 text-right font-normal">YoY</th>
          </tr>
        </thead>
        <tbody>
          {c.lines.map((l) => (
            <tr key={l.name} className="border-t border-rule">
              <th scope="row" className="py-2 text-left font-sans text-15 font-semibold">{l.name}</th>
              <td className="py-2 text-right">{crore(l.value)}</td>
              <td className="w-[4.5rem] py-2 text-right"><Change v={l.qoq_pct} /></td>
              <td className="w-[4.5rem] py-2 text-right"><Change v={l.yoy_pct} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {c.one_offs.map((o) => (
        <p key={o} className="mt-2 font-semibold text-ink">{o}.</p>
      ))}
      {c.note && <p className="mt-2 text-13 text-ink-3">{c.note}.</p>}
    </>
  );
}

function Mgmt({ c }: { c: MgmtCard }) {
  return (
    <ul className="space-y-3">
      {c.people.map((p) => (
        <li key={p.name + p.change}>
          <p className="font-serif text-17 font-semibold text-ink">{p.name}</p>
          <p className="text-ink-2">
            {sentence(p.change)}
            {p.role && ` · ${p.role}`}
            {p.effective && ` · from ${p.effective}`}
          </p>
          {p.bio && <Bio text={p.bio} cited={p.bio_page != null} page={p.bio_page} />}
        </li>
      ))}
    </ul>
  );
}

function Bio({ text, cited, page }: { text: string; cited: boolean; page: number | null }) {
  const [full, setFull] = useState(false);
  if (!cited) return <p className="mt-1 text-ink-2">{text}</p>; // "Profile not in this filing; see …"
  return (
    <div className="mt-1">
      <p className={full ? "" : "line-clamp-3"}>{text}</p>
      <p className="mt-1 text-13 text-ink-3">
        Profile from the filing, p. {page}
        {!full && (
          <>
            {" · "}
            <button type="button" onClick={() => setFull(true)} className="press -my-3 inline-block rounded-[4px] py-3 font-semibold text-accent">Full profile</button>
          </>
        )}
      </p>
    </div>
  );
}

const INSTRUMENT = { equity: "Equity", warrants: "Warrants (convert to equity)", debt: "Debt", other: "Other" };

// Only what the filing states: size as printed (converted to ₹ crore), dilution = shares issued / shares after.
function Fund({ c, i }: { c: FundCard; i: RankedItem }) {
  return (
    <>
      <p>{INSTRUMENT[c.instrument]}{i.subject && ` · As filed: ${i.subject}`}</p>
      <p className="mt-1">
        {c.size_cr != null ? <>Size <span className="font-mono text-ink">₹{crore(c.size_cr)} cr</span>{c.size_page && <span className="text-ink-2"> (p. {c.size_page})</span>}</> : <span className="text-ink-2">Size not stated in this filing</span>}
        {c.instrument === "debt" ? <span className="text-ink-2"> · debt, no dilution</span>
          : c.dilution_pct != null ? <> · Dilution <span className="font-mono text-ink">{c.dilution_pct.toFixed(2)}%</span> <span className="text-ink-2">(shares issued ÷ shares after the issue)</span></>
          : <span className="text-ink-2"> · dilution not stated</span>}
      </p>
    </>
  );
}

function Other({ i }: { i: RankedItem }) {
  const missingCard = i.tier === "P1" && i.category === "results"; // P1 results without a card: the sanity gate refused it
  return (
    <>
      {i.subject && <p>As filed: {i.subject}</p>}
      {i.note && <p className="mt-1">{i.note}</p>}
      {missingCard && !i.card_error && (
        <p className="mt-1">Numbers not shown: no results table in this filing could be checked. Open the filing for the figures.</p>
      )}
    </>
  );
}

function Source({ i, page }: { i: RankedItem; page?: number }) {
  const failed = i.card_error || i.classify_error;
  return (
    <>
      {failed && <p className="mt-2">Couldn&rsquo;t read this filing automatically. The original is linked below.</p>}
      <p className="mt-2 text-13 text-ink-3">
        {i.url ? (
          <a href={page ? `${i.url}#page=${page}` : i.url} target="_blank" rel="noopener" className="press -my-3 inline-block rounded-[4px] py-3 font-semibold text-accent">
            {page ? `Open filing at p. ${page}` : "Open filing"} →
          </a>
        ) : (
          "No attachment on this filing"
        )}
        <span className="font-mono text-11">{` · ${i.source.toUpperCase()} · `}</span>{i.name}
      </p>
    </>
  );
}
