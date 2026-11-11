// TS port of backend/finn/push/rank.py so changing thresholds re-ranks on the phone.
// Both implementations run the shared table in backend/tests/rank_cases.json (see rank.test.ts).

export type Reaction = { move_pct: number; nifty_pct: number | null; excess_pct: number | null; vol_ratio: number | null };
export type Tier = "P1" | "P2" | "P3";
export type RankInput = { tier: Tier; category: string; reaction: Reaction | null; reaction_day: string; last_bar: string | null };
export type Ranked = { score: number; reason: string; boosted: boolean; collapsed: boolean };

const BASE: Record<Tier, number> = { P1: 300, P2: 200, P3: 100 };
const BOOST = 150; // a P2 the market reacted to outranks a quiet P1
const LABEL: Record<string, string> = { m_and_a: "M&A", agm_egm: "AGM/EGM", credit_rating_downgrade: "rating downgrade" };

export const label = (cat: string) => LABEL[cat] ?? cat.replaceAll("_", " ");

// Python's format() rounds exact binary ties to even (3.25 -> 3.2); toFixed rounds them up. Match Python.
function fixed1(a: number): string {
  const t = a * 10;
  if (Number.isInteger(a * 4) && t % 1 === 0.5) {
    const f = Math.floor(t);
    return ((f % 2 ? f + 1 : f) / 10).toFixed(1);
  }
  return a.toFixed(1);
}

export const pct = (x: number) => (x < 0 || Object.is(x, -0) ? "−" : "+") + fixed1(Math.abs(x)) + "%";

export function hits(r: Reaction | null, volN: number, moveX: number): string[] {
  if (!r) return [];
  const out: string[] = [];
  const ex = r.excess_pct;
  if (Math.abs(ex ?? r.move_pct) >= moveX) out.push(ex != null ? `${pct(r.move_pct)} (${pct(ex)} vs Nifty)` : pct(r.move_pct));
  if ((r.vol_ratio ?? 0) >= volN) out.push(`${fixed1(r.vol_ratio!)}× volume`);
  return out;
}

export function rank(item: RankInput, volN: number, moveX: number): Ranked {
  // routine paperwork (P3) never explains a move; the move still raises its own price alert
  const h = item.tier !== "P3" ? hits(item.reaction, volN, moveX) : [];
  const lab = label(item.category);
  const r = item.reaction;
  let reason: string;
  if (h.length) reason = `Ranked high: ${lab} · ` + h.join(" · ");
  else if (r) reason = `${lab} · ` + (r.excess_pct != null ? `${pct(r.excess_pct)} vs Nifty` : pct(r.move_pct));
  else if (item.last_bar && item.reaction_day > item.last_bar) reason = `${lab} · Reaction pending`;
  else reason = `${lab} · No price data`;
  return { score: BASE[item.tier] + (h.length ? BOOST : 0), reason, boosted: h.length > 0, collapsed: item.tier === "P3" && !h.length };
}
