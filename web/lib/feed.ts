"use client";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { sameEvent } from "./alerts";
import { hits, label, pct, rank, type Ranked, type Reaction, type Tier } from "./rank";

// ---- shape of web/public/data/feed.json (written by backend/finn/ingest.py) ----
export type ResultsLine = { name: string; value: number | null; qoq_pct: number | null; yoy_pct: number | null };
export type ResultsCard = {
  type: "results"; basis: string; unit: string; note: string | null; periods: string[];
  lines: ResultsLine[]; one_offs: string[]; pages: number[]; model_note: string | null;
};
export type Person = { name: string; change: string; role: string | null; effective: string | null; bio: string | null; bio_page: number | null; profile_ref: string | null };
export type MgmtCard = { type: "management_change"; people: Person[]; model_note: string | null };
// size and dilution as the filing states them (Python converts units and divides; null when not stated)
export type FundCard = {
  type: "fund_raise"; instrument: "equity" | "warrants" | "debt" | "other";
  size_cr: number | null; size_page: number | null; dilution_pct: number | null; model_note: string | null;
};
export type Item = {
  id: string; symbol: string; name: string; filed: string; subject: string | null; headline: string | null; note: string | null;
  category: string; tier: Tier; classify_error: string | null; card_error?: string; url: string | null; source: string;
  reaction_day: string; last_bar: string | null; reaction: Reaction | null; card?: ResultsCard | MgmtCard | FundCard; title?: string | null;
};
// credibility: measured PvD promises from the last 4 calls (kept = hit/ahead, missed = miss/behind/moved away,
// open = on track); null when nothing was measurable. See DECISIONS.md.
export type Credibility = { kept: number; missed: number; open: number };
// stale_as_of: this run couldn't refresh the company, so its filings are the last good fetch from that time
export type Company = { name: string; sector: string | null; closes: [string, number][]; credibility?: Credibility | null; stale_as_of?: string };
export type Day = Reaction & { symbol: string; date: string };
export type Feed = {
  generated_at: string; window: [string, string]; thresholds: { volume_multiple: number; excess_move_pct: number };
  portfolio?: string[]; companies?: Record<string, Company>; nifty?: [string, number][];
  items: Item[]; alerts: { symbol: string; date: string; kind: string; text: string }[]; days: Day[];
  failed: { symbol: string; error: string; as_of?: string }[];
};
export type RankedItem = Item & Ranked;

// ---- settings (localStorage) ----
// Defaults mirror backend/finn/config.py (VOLUME_MULTIPLE, EXCESS_MOVE_PCT, TIERS["P1"]).
export const P1_CATS = ["results", "m_and_a", "management_change", "fund_raise", "litigation", "credit_rating_downgrade", "pledging"];
export type Settings = { volN: number; moveX: number; cats: string[] };
export const DEFAULTS: Settings = { volN: 2, moveX: 3, cats: P1_CATS };

function localStore(key: string) {
  const subscribe = (cb: () => void) => {
    const on = (e: Event) => (!(e instanceof StorageEvent) || e.key === key) && cb();
    window.addEventListener("storage", on);
    window.addEventListener("finn-store", on);
    return () => { window.removeEventListener("storage", on); window.removeEventListener("finn-store", on); };
  };
  const get = () => localStorage.getItem(key);
  const set = (v: string | null) => {
    if (v == null) localStorage.removeItem(key); else localStorage.setItem(key, v);
    window.dispatchEvent(new Event("finn-store"));
  };
  return { subscribe, get, set };
}

const settingsStore = localStore("finn.settings");

export function useSettings(): [Settings, (s: Partial<Settings> | null) => void] {
  const raw = useSyncExternalStore(settingsStore.subscribe, settingsStore.get, () => null);
  const s = useMemo(() => {
    try { return { ...DEFAULTS, ...JSON.parse(raw ?? "{}") } as Settings; } catch { return DEFAULTS; } // corrupt value: defaults
  }, [raw]);
  const update = useCallback((patch: Partial<Settings> | null) => {
    if (patch == null) return settingsStore.set(null);
    let cur = {};
    try { cur = JSON.parse(settingsStore.get() ?? "{}"); } catch {}
    settingsStore.set(JSON.stringify({ ...cur, ...patch }));
  }, []);
  return [s, update];
}

// ---- loading ----
let cached: Promise<Feed> | null = null;
const load = () => (cached ??= fetch("/data/feed.json", { cache: "no-cache" }).then((r) => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<Feed>;
}));

export function useFeed() {
  const [state, setState] = useState<{ feed?: Feed; error?: string }>({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    load().then(
      (feed) => live && setState({ feed }),
      (e) => { cached = null; if (live) setState({ error: String(e?.message ?? e) }); },
    );
    return () => { live = false; };
  }, [attempt]);
  return { ...state, retry: () => { setState({}); setAttempt((a) => a + 1); } };
}

// ---- windowing + ranking ----
export type Win = "24h" | "7d" | "30d";
export const WIN_HOURS: Record<Win, number> = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };
export const WIN_PERIOD: Record<Win, string> = { "24h": "today", "7d": "this week", "30d": "this month" };

const ist = (s: string) => new Date(s.length === 16 ? `${s}:00+05:30` : s); // filings are naive IST timestamps

export function inWindow(feed: Feed, w: Win): Item[] {
  const since = ist(feed.generated_at).getTime() - WIN_HOURS[w] * 3600e3;
  return feed.items.filter((i) => ist(i.filed).getTime() >= since);
}

export function ranked(items: Item[], s: Settings): RankedItem[] {
  return items
    .map((i) => ({ ...i, ...rank(i, s.volN, s.moveX) }))
    .sort((a, b) => b.score - a.score || b.filed.localeCompare(a.filed)); // rank, then newest first
}

// ---- alerts (recomputed here so threshold/category changes apply immediately) ----
// sev orders a day's alerts (material filing > price move by size > volume by multiple > data problem);
// minor = a volume-only spike under MINOR_VOL, folded behind "+N smaller volume spikes" (user, 13 Nov)
// parts: the crossings as short facts ("−3.3% vs Nifty", "2.3× vol"); strong = extreme (≥5× volume or twice the move threshold)
export type Alert = {
  key: string; symbol: string; date: string; kind: "price" | "filing" | "error"; text: string; url?: string | null; item?: Item;
  sev: number; minor?: boolean; parts?: { t: string; strong: boolean }[];
};
export const MINOR_VOL = 3;
export const ALERT_DAYS = 7;
const EXTREME_VOL = 5;

export function buildAlerts(feed: Feed, s: Settings): Alert[] {
  const out: Alert[] = [];
  for (const d of feed.days) {
    const h = hits(d, s.volN, s.moveX);
    if (!h.length) continue;
    const move = Math.abs(d.excess_pct ?? d.move_pct);
    const moved = move >= s.moveX, vol = d.vol_ratio ?? 0;
    const parts = [];
    if (moved) parts.push({ t: d.excess_pct != null ? `${pct(d.excess_pct)} vs Nifty` : pct(d.move_pct), strong: move >= 2 * s.moveX });
    if (vol >= s.volN) parts.push({ t: `${vol.toFixed(1)}× vol`, strong: vol >= EXTREME_VOL });
    out.push({ key: `price|${d.symbol}|${d.date}`, symbol: d.symbol, date: d.date, kind: "price", text: h.join(" · "), parts,
      sev: moved ? 200 + move : 100 + vol, minor: !moved && vol < MINOR_VOL });
  }
  // Material (P1) filings in the chosen categories only (user, 14 Nov). One per (symbol, day, category): results are
  // often filed twice; and a repeat of the same event within a week (approval, then the appointment) keeps the first.
  const seen = new Set<string>();
  const kept: Item[] = [];
  for (const i of [...feed.items].sort((a, b) => a.filed.localeCompare(b.filed))) {
    const key = `filing|${i.symbol}|${i.filed.slice(0, 10)}|${i.category}`;
    if (i.tier !== "P1" || !s.cats.includes(i.category) || seen.has(key)) continue;
    const text = i.headline || i.subject || "";
    if (kept.some((k) => k.symbol === i.symbol && k.category === i.category && Date.parse(i.filed) - Date.parse(k.filed) <= 7 * 864e5
      && sameEvent(k.headline || k.subject || "", text))) continue;
    seen.add(key);
    kept.push(i);
    out.push({ key, symbol: i.symbol, date: i.filed.slice(0, 10), kind: "filing", text: `${sentence(label(i.category))}: ${text}`, url: i.url, item: i, sev: 300 });
  }
  for (const a of feed.alerts.filter((a) => a.kind === "error"))
    out.push({ key: `error|${a.symbol}|${a.date}`, symbol: a.symbol, date: a.date, kind: "error", text: a.text, sev: 0 });
  for (const f of feed.failed)
    out.push({ key: `error|${f.symbol}|failed`, symbol: f.symbol, date: feed.window[1], kind: "error", text: f.as_of ? `Couldn't refresh; showing filings as of ${filedAt(f.as_of)}` : `Couldn't fetch filings: ${f.error}`, sev: 0 });
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.sev - a.sev || a.symbol.localeCompare(b.symbol));
}

// Unseen alerts. First visit: everything before the latest day counts as seen (user's rule, 12 Nov).
const seenStore = localStore("finn.seen");

export function useUnseen(alerts: Alert[] | undefined) {
  const raw = useSyncExternalStore(seenStore.subscribe, seenStore.get, () => "SSR");
  useEffect(() => {
    if (!alerts?.length || raw !== null) return;
    const latest = (alerts.find((a) => a.kind !== "error") ?? alerts[0]).date;
    seenStore.set(JSON.stringify(alerts.filter((a) => a.date < latest).map((a) => a.key)));
  }, [alerts, raw]);
  let seen = new Set<string>();
  try { seen = new Set(raw && raw !== "SSR" ? JSON.parse(raw) : []); } catch {}
  const unseen = raw === null || raw === "SSR" ? [] : (alerts ?? []).filter((a) => !seen.has(a.key));
  const markAll = useCallback(() => alerts && seenStore.set(JSON.stringify(alerts.map((a) => a.key))), [alerts]);
  return { unseen, markAll, ready: raw !== null && raw !== "SSR" };
}

// ---- formatting ----
export const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const shortDate = (iso: string) => `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}`;
export const filedAt = (filed: string) => `${shortDate(filed)} ${filed.slice(11, 16)}`;
export const istTime = (iso: string) => iso.slice(11, 16);
export const longDate = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(ist(iso));
