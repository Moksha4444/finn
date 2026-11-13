"use client";
import { useEffect, useState } from "react";

// ---- shape of web/public/data/research/{SYMBOL}.json (backend/finn/pull/research.py) ----
export type Cite = { label: string; url: string | null };
// target band with the bounds the verdict used; lo/hi null = open on that side
// end: the deadline quarter (null = no deadline); the band stops there
export type PathChart = { kind: "growth" | "margin" | "level"; points: [string, number][]; lo: number | null; hi: number | null; direction: string; end?: string | null };
export type PromiseRow = {
  metric: string; target: string; period: string; said_in: string; call: string; quote: string; page: number | null; transcript: string;
  verdict: string; actual: string; why: string; path: string | null; cites: Cite[]; actual_source: string | null; model: string | null;
  chart?: PathChart | null;
};
export type Counts = { kept: number; missed: number; open: number; partial: number; measured: number; total: number };
export type Snapshot = {
  basis: string; lender: boolean; unit: string; source: string;
  quarters?: { periods: string[]; revenue: number[]; pat: number[]; revenue_name: string; claim: string };
  margin?: { name: string; periods: string[]; values: number[]; claim: string };
  cash?: { years: string[]; cfo: number[]; pat: number[]; claim: string } | { note: string };
  leverage?: { years: string[]; values: number[]; claim: string } | { note: string };
};
export type Point = { point: string; why?: string; cites: Cite[] }; // point = the claim, why = why it matters
export type Research = {
  symbol: string; name: string; sector: string | null; generated_at: string; latest_quarter: string | null;
  calls: { quarter: string; call: string; transcript: string }[]; skipped_calls: { call: string; transcript: string; error: string }[];
  margin_definition: { name: string; source: string } | null; model_note: string | null;
  summary: Counts & { unmeasured: number; sentence: string }; promises: PromiseRow[];
  prices: { closes: [string, number][]; nifty: [string, number][] } | null;
  snapshot: Snapshot; bull_bear: { bull: Point[]; bear: Point[]; dropped: number; model: string; model_note: string | null } | null;
  sources: Cite[];
};
export type IndexRow = { symbol: string; name: string; sector: string | null; generated_at: string; summary: Counts };

// The chip's buckets (same as backend/finn/ingest.py): kept = hit/ahead, missed = miss/behind pace/moved away, open = on track.
export const KEPT = ["hit", "ahead"], MISSED = ["miss", "behind pace", "moved away"], OPEN = ["on track"];
export const NYM = "not-yet-measurable";
export const VERDICT_TEXT: Record<string, string> = {
  hit: "Hit", ahead: "Ahead", "on track": "On track", "moved closer": "Moved closer", partial: "Partial",
  "no change": "No change", "behind pace": "Behind pace", "moved away": "Moved away", miss: "Missed",
};

// "Kept 3 · Missed 2 · Open 1" (+ Partial when any), zero buckets after Kept left out.
export function countsText(c: Counts) {
  return [`Kept ${c.kept}`, c.missed > 0 && `Missed ${c.missed}`, c.open > 0 && `Open ${c.open}`, c.partial > 0 && `Partial ${c.partial}`]
    .filter(Boolean).join(" · ");
}

// ---- loading: 404 means "not researched", anything else is a load failure ----
type State<T> = { data?: T; missing?: boolean; error?: string };
const memo = new Map<string, Promise<unknown>>();

function get<T>(url: string): Promise<T | null> {
  if (!memo.has(url))
    memo.set(url, fetch(url, { cache: "no-cache" }).then((r) => {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }).catch((e) => { memo.delete(url); throw e; }));
  return memo.get(url) as Promise<T | null>;
}

export function useJson<T>(url: string | null): State<T> & { retry: () => void } {
  const [s, setS] = useState<State<T> & { url?: string }>({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!url) return;
    let live = true;
    get<T>(url).then(
      (d) => live && setS(d == null ? { missing: true, url } : { data: d, url }),
      (e) => live && setS({ error: String(e?.message ?? e), url }),
    );
    return () => { live = false; };
  }, [url, attempt]);
  const cur = s.url === url ? s : {}; // never show the previous company's page while the next one loads
  return { ...cur, retry: () => { setS({}); setAttempt((a) => a + 1); } };
}

export const indexUrl = "/data/research/index.json";
export const researchUrl = (sym: string) => `/data/research/${encodeURIComponent(sym.toUpperCase())}.json`;
