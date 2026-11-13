// One entry per company per window: its most important filing leads, results documents fold into the
// results item, everything else folds behind "+N more filings". Pure, so it is tested (group.test.ts).
import type { RankedItem } from "./feed";

// "results > mgmt change > fund raise > ..." (the user's order, 12 Nov)
const ORDER = ["results", "management_change", "fund_raise", "m_and_a", "litigation", "credit_rating_downgrade", "pledging",
  "internal_restructuring", "capex", "dividend", "bonus_split", "credit_rating", "press_release", "earnings_call"];
const rankOf = (c: string) => (ORDER.indexOf(c) + 1 || ORDER.length + 1);

export type Group = {
  symbol: string;
  lead: RankedItem;
  docs: RankedItem[];   // other results filings (deck, outcome letter, press release on results) under a results lead
  more: RankedItem[];   // everything else the company filed in the window (not routine)
  material: boolean;    // a P1 lead, or the market moved on one of its filings
  score: number;
};

const leadOrder = (a: RankedItem, b: RankedItem) =>
  a.tier.localeCompare(b.tier) ||                     // P1 before P2
  Number(!!b.card) - Number(!!a.card) ||               // a filing we could read beats one we couldn't
  rankOf(a.category) - rankOf(b.category) ||
  b.score - a.score || b.filed.localeCompare(a.filed);

const RESULTS_PR = /result/i;

export function group(items: RankedItem[]): Group[] {
  const by = new Map<string, RankedItem[]>();
  for (const i of items) if (!i.collapsed) by.set(i.symbol, [...(by.get(i.symbol) ?? []), i]);
  const out: Group[] = [];
  for (const [symbol, list] of by) {
    const [lead, ...rest] = [...list].sort(leadOrder);
    const isDoc = (i: RankedItem) =>
      lead.category === "results" && (i.category === "results" || (i.category === "press_release" && RESULTS_PR.test(`${i.subject} ${i.headline}`)));
    out.push({
      symbol, lead,
      docs: rest.filter(isDoc),
      more: rest.filter((i) => !isDoc(i)),
      material: lead.tier === "P1" || list.some((i) => i.boosted),
      score: Math.max(...list.map((i) => i.score)),
    });
  }
  // equal scores: the bigger move vs Nifty, then the bigger volume spike, leads (the 30-day view is all ties)
  const all = (g: Group) => [g.lead, ...g.docs, ...g.more].filter((i) => i.boosted && i.reaction);
  const move = (g: Group) => Math.max(0, ...all(g).map((i) => Math.abs(i.reaction!.excess_pct ?? i.reaction!.move_pct)));
  const vol = (g: Group) => Math.max(0, ...all(g).map((i) => i.reaction!.vol_ratio ?? 0));
  return out.sort((a, b) => Number(b.material) - Number(a.material) || b.score - a.score || move(b) - move(a) || vol(b) - vol(a) || b.lead.filed.localeCompare(a.lead.filed));
}
