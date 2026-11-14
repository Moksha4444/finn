// Pure alert helpers (tested in alerts.test.ts): spotting one event filed twice, and folding a day's alerts
// into one row per company.
import type { Alert } from "./feed";

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);

// Two headlines tell the same event when most words of the shorter one are in the longer one
// (HDFC Bank, Nov 2026: RBI's approval of a re-appointment on the 12th, the re-appointment itself on the 13th).
export function sameEvent(a: string, b: string): boolean {
  const [s, l] = [words(a), words(b)].sort((x, y) => x.size - y.size);
  if (s.size < 4) return false; // "Outcome of board meeting" is too generic to call a repeat
  let n = 0;
  for (const w of s) if (l.has(w)) n++;
  return n / s.size >= 0.7;
}

// One row per company per day: the market move, its filings and any data problem together.
export type AlertRow = { key: string; symbol: string; date: string; keys: string[]; market?: Alert; filings: Alert[]; errors: Alert[]; sev: number; minor: boolean };

export function alertRows(alerts: Alert[]): AlertRow[] {
  const by = new Map<string, AlertRow>();
  for (const a of alerts) {
    const key = `${a.symbol}|${a.date}`;
    let r = by.get(key);
    if (!r) by.set(key, (r = { key, symbol: a.symbol, date: a.date, keys: [], filings: [], errors: [], sev: 0, minor: true }));
    r.keys.push(a.key);
    r.sev += a.sev; // a filing with a move outranks either alone
    r.minor &&= !!a.minor; // folded only when everything on it is a small volume spike
    if (a.kind === "price") r.market = a;
    else (a.kind === "filing" ? r.filings : r.errors).push(a);
  }
  return [...by.values()].sort((a, b) => b.date.localeCompare(a.date) || b.sev - a.sev || a.symbol.localeCompare(b.symbol));
}

// What the badge counts and the inbox headline names: a move or a filing, not a small volume spike or a data note.
export const needsLook = (r: AlertRow) => !r.minor && (!!r.market || r.filings.length > 0);
