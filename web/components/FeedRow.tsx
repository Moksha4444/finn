"use client";
import { useState } from "react";
import { filedAt, sentence, shortDate, type Item, type MgmtCard, type RankedItem, type ResultsCard, type ResultsLine } from "@/lib/feed";
import { label, pct } from "@/lib/rank";
import { Signed } from "./Signed";
import { period } from "@/lib/period";

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
    <li className="border-b border-rule">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="block w-full py-3 text-left active:bg-paper-2"
      >
        {/* line 1: who, what, and the market's verdict; line 2: the fact and when. Both single-line. */}
        <span className="flex items-baseline gap-2 whitespace-nowrap">
          <span className="shrink-0 text-[0.9375rem] font-semibold tracking-[0.01em]">{i.symbol}</span>
          <span className="shrink-0 text-[0.875rem] text-ink-2">{eventLabel(i)}</span>
          {i.tier === "P1" && (
            <span className="inline-block size-[0.4375rem] shrink-0 -translate-y-px rounded-[1px] bg-accent" role="img" aria-label="Material" />
          )}
          {/* Each reason part is a unit; one that doesn't fit wraps onto the clipped second line, so a part is dropped whole, never cut. */}
          <span className={`ml-auto flex h-5 min-w-0 flex-wrap justify-end gap-x-1 overflow-hidden pl-2 text-[0.8125rem] leading-5 ${quietReason ? "text-ink-2 italic" : i.boosted ? "font-semibold" : "text-ink-2"}`}>
            {i.boosted && <span className="sr-only">Ranked high: </span>}
            {shownReason && shownReason.split(" · ").map((u, k) => (
              <span key={k}>{k > 0 && "· "}<Signed text={u} /></span>
            ))}
          </span>
        </span>
        <span className="mt-0.5 flex items-baseline gap-3 text-[0.875rem] leading-[1.4] whitespace-nowrap">
          <span className="min-w-0 truncate"><Signed text={keyFact(i)} /></span>
          <span className="ml-auto shrink-0 text-[0.8125rem] text-ink-2">{filedAt(i.filed)}</span>
        </span>
      </button>
      {open && <div id={id} className="pb-4"><Detail i={i} /></div>}
    </li>
  );
}

export function Detail({ i }: { i: RankedItem }) {
  return (
    <div className="pt-1 text-[0.875rem] leading-[1.45]">
      {i.card?.type === "results" ? <Results c={i.card} /> : i.card?.type === "management_change" ? <Mgmt c={i.card} /> : <Other i={i} />}
      <Why i={i} />
      <Source i={i} page={i.card?.type === "results" ? i.card.pages[0] : undefined} />
    </div>
  );
}

function Why({ i }: { i: RankedItem }) {
  const day = i.reaction ? ` on ${shortDate(i.reaction_day)}` : "";
  return (
    <p className="mt-2 text-[0.8125rem] text-ink-2">
      <span className="font-medium text-ink">Why it&rsquo;s here: </span>
      <Signed text={i.reason.replace(/^Ranked high: /, "ranked high: ").replace("Reaction pending", "market reaction not in yet")} />
      {day}
    </p>
  );
}

export const crore = (v: number | null) =>
  v == null ? "not disclosed" : v.toLocaleString("en-IN", { maximumFractionDigits: Math.abs(v) < 100 ? 1 : 0 });

function Change({ v }: { v: number | null }) {
  return v == null ? <span className="text-ink-2">–</span> : <Signed text={pct(v)} />;
}

function Results({ c }: { c: ResultsCard }) {
  return (
    <>
      <table className="w-full border-collapse">
        <caption className="pb-1.5 text-left text-[0.8125rem] text-ink-2">
          {sentence(c.basis)} · {c.unit}
        </caption>
        <thead>
          <tr className="text-[0.75rem] text-ink-2">
            <th scope="col" className="pb-1 text-left font-normal"><span className="sr-only">Line</span></th>
            <th scope="col" className="pb-1 text-right font-normal">{period(c.periods[0])}</th>
            <th scope="col" className="pb-1 text-right font-normal">QoQ</th>
            <th scope="col" className="pb-1 text-right font-normal">YoY</th>
          </tr>
        </thead>
        <tbody>
          {c.lines.map((l) => (
            <tr key={l.name} className="border-t border-rule">
              <th scope="row" className="py-1.5 text-left font-medium">{l.name}</th>
              <td className="py-1.5 text-right">{crore(l.value)}</td>
              <td className="w-[4.5rem] py-1.5 text-right"><Change v={l.qoq_pct} /></td>
              <td className="w-[4.5rem] py-1.5 text-right"><Change v={l.yoy_pct} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {c.one_offs.map((o) => (
        <p key={o} className="mt-2 font-medium">{o}.</p>
      ))}
      {c.note && <p className="mt-2 text-[0.8125rem] text-ink-2">{c.note}.</p>}
      {c.model_note && <p className="mt-1 text-[0.8125rem] text-ink-2">{c.model_note}</p>}
    </>
  );
}

function Mgmt({ c }: { c: MgmtCard }) {
  return (
    <ul className="space-y-3">
      {c.people.map((p) => (
        <li key={p.name + p.change}>
          <p className="font-semibold">{p.name}</p>
          <p className="text-ink-2">
            {sentence(p.change)}
            {p.role && ` · ${p.role}`}
            {p.effective && ` · from ${p.effective}`}
          </p>
          {p.bio && <Bio text={p.bio} cited={p.bio_page != null} page={p.bio_page} />}
        </li>
      ))}
      {c.model_note && <li className="text-[0.8125rem] text-ink-2">{c.model_note}</li>}
    </ul>
  );
}

function Bio({ text, cited, page }: { text: string; cited: boolean; page: number | null }) {
  const [full, setFull] = useState(false);
  if (!cited) return <p className="mt-1 text-ink-2">{text}</p>; // "Profile not in this filing; see …"
  return (
    <div className="mt-1">
      <p className={full ? "" : "line-clamp-3"}>{text}</p>
      <p className="mt-0.5 text-[0.8125rem] text-ink-2">
        Profile from the filing, p. {page}
        {!full && (
          <>
            {" · "}
            <button type="button" onClick={() => setFull(true)} className="text-accent underline">Full profile</button>
          </>
        )}
      </p>
    </div>
  );
}

function Other({ i }: { i: RankedItem }) {
  const missingCard = i.tier === "P1" && i.category === "results"; // P1 results without a card: the sanity gate refused it
  return (
    <>
      {i.subject && <p className="text-ink-2">As filed: {i.subject}</p>}
      {i.note && <p className="mt-1 text-ink-2">{i.note}</p>}
      {missingCard && !i.card_error && (
        <p className="mt-1 text-ink-2">Numbers not shown: no results table in this filing could be checked. Open the filing for the figures.</p>
      )}
    </>
  );
}

function Source({ i, page }: { i: RankedItem; page?: number }) {
  const failed = i.card_error || i.classify_error;
  return (
    <>
      {failed && <p className="mt-2 text-ink-2">Couldn&rsquo;t read this filing automatically. The original is linked below.</p>}
      <p className="mt-2 text-[0.8125rem] text-ink-2">
        {i.url ? (
          <a href={page ? `${i.url}#page=${page}` : i.url} target="_blank" rel="noopener" className="font-medium text-accent underline">
            {page ? `Open filing at p. ${page}` : "Open filing"}
          </a>
        ) : (
          "No attachment on this filing"
        )}
        {` · ${i.source.toUpperCase()} · ${i.name}`}
      </p>
    </>
  );
}
